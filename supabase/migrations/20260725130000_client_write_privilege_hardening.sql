-- 2026-07-25 — client-side write privilege hardening.
--
-- Context
-- -------
-- The browser holds the Supabase anon key (apps/web/lib/supabase/client.ts), so
-- any signed-in user can bypass the Next.js API routes entirely and talk to
-- PostgREST directly with their own JWT. Row Level Security is therefore the
-- only enforcement boundary for anything the client can reach.
--
-- The row-level half of that was already correct: every `FOR ALL USING (...)`
-- policy also acts as the WITH CHECK expression when WITH CHECK is omitted, so
-- users could never read or write *another user's* rows.
--
-- What was missing is the COLUMN-level half. RLS is row-granular, not
-- column-granular: a policy that lets you update your own row lets you update
-- EVERY column of your own row. `public.profiles` carries the entitlement,
-- billing and privilege columns, so `"own profile" FOR ALL USING (auth.uid() = id)`
-- meant any user could run this from the browser console:
--
--     supabase.from('profiles').update({ is_admin: true }).eq('id', myUserId)
--
-- `lib/admin.ts::isAdmin()` grants admin purely on `profiles.is_admin`, and nine
-- admin API routes gate on it — so that single statement was a full privilege
-- escalation to the admin console. The same write also covered `tier`
-- ('unlimited'), `purchased_credits`, `bonus_runs`, `genesis_uses_this_month`,
-- `totp_enabled`/`email_2fa_enabled` (self-disabling 2FA), `legal_consented_at`
-- (forging a consent record) and `processing_restricted` (undoing an
-- admin-applied GDPR restriction).
--
-- Approach
-- --------
-- Postgres has no column-level RLS, but it does have column-level GRANTs, and
-- PostgREST enforces them. So the fix is:
--
--   1. Revoke blanket INSERT/UPDATE from the client roles and re-grant only the
--      columns a user legitimately edits about themselves. This is the primary
--      control.
--   2. A BEFORE INSERT/UPDATE trigger as defense in depth, so the privileged
--      columns stay protected even if someone later runs the common
--      `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated` footgun.
--   3. Make the runtime- and billing-owned tables client-read-only, since every
--      write to them already goes through service-role server code.
--
-- Nothing in the app breaks: every server route that writes these columns uses
-- `createServiceClient()` (service_role), which bypasses both RLS and column
-- grants. The only direct client writes to `profiles` are the display_name /
-- avatar_url / username / bio upserts in profile-form.tsx, onboarding-wizard.tsx
-- and sidebar.tsx, all of which stay working.


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 1 — public.profiles: column-level write privileges
-- ═══════════════════════════════════════════════════════════════════════════

-- Replace the single FOR ALL policy with explicit per-command policies. DELETE
-- is deliberately not granted: deleting your profile row cascades into programs,
-- connections, api_keys and usage, and account deletion has a proper server-side
-- path (/api/user/data-request) that also revokes OAuth grants and cancels
-- billing. A direct client DELETE would silently skip all of that.
DROP POLICY IF EXISTS "own profile" ON public.profiles;

CREATE POLICY "read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Column-level privileges. Supabase's default grants hand `anon`/`authenticated`
-- table-wide privileges, so revoke first — column grants are additive and cannot
-- narrow an existing table-level grant.
REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;

-- These are the only columns the browser writes: the display_name / avatar_url /
-- username / bio upserts in profile-form.tsx, onboarding-wizard.tsx and
-- sidebar.tsx. Everything else about a profile is server-managed.
--
-- `id` is in both lists on purpose. PostgREST resolves an upsert to
-- `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` and puts every column from the
-- request body in the SET clause — including the conflict target — so without
-- UPDATE (id) a perfectly ordinary profile save would fail with "permission
-- denied for column id". Granting it is safe because the id cannot actually
-- move: the UPDATE policy's WITH CHECK pins it to auth.uid(), and the trigger
-- below rejects any change to it outright.
GRANT INSERT (id, display_name, avatar_url, username, bio, updated_at)
  ON public.profiles TO authenticated;

GRANT UPDATE (id, display_name, avatar_url, username, bio, updated_at)
  ON public.profiles TO authenticated;

-- No client role has any business deleting a profile row: it cascades into
-- programs, connections, api_keys and usage, and account deletion has a
-- server-side path (/api/user/data-request) that also revokes OAuth grants and
-- cancels billing. RLS already denies it — there is no DELETE policy — but
-- revoke the privilege too so both layers agree.
REVOKE DELETE ON public.profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.profiles FROM anon;


-- ─── Defense in depth: reject privileged-column writes from client roles ────

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- PostgREST does `SET ROLE authenticated` (or `anon`) for end-user requests
  -- and `service_role` for service-key requests. Migrations and SECURITY
  -- DEFINER functions such as handle_new_user() run as the table owner. Only
  -- the two end-user roles are constrained here.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A profile a user creates for themselves starts with no entitlements.
    -- Reset rather than raise: PostgREST upserts fire BEFORE INSERT even when
    -- the row already exists and the statement resolves to the ON CONFLICT
    -- UPDATE branch, and that branch only assigns the columns actually present
    -- in the request body — so clearing them here cannot disturb a legitimate
    -- profile upsert.
    NEW.org_id                        := NULL;
    NEW.tier                          := 'free';
    NEW.plan_expires_at               := NULL;
    NEW.is_admin                      := FALSE;
    NEW.team_role                     := NULL;
    NEW.bonus_runs                    := 0;
    NEW.is_beta_tester                := FALSE;
    NEW.is_expert                     := FALSE;
    NEW.purchased_credits             := 0;
    NEW.included_credits_used         := 0;
    NEW.genesis_uses_this_month       := 0;
    NEW.bonus_genesis_uses            := 0;
    NEW.stripe_payment_method_id      := NULL;
    NEW.processing_restricted         := FALSE;
    NEW.processing_restricted_at      := NULL;
    NEW.processing_restriction_reason := NULL;
    NEW.legal_consented_at            := NULL;
    NEW.legal_consent_version         := NULL;
    NEW.email_2fa_enabled             := FALSE;
    NEW.totp_enabled                  := FALSE;
    NEW.totp_secret                   := NULL;
    NEW.totp_verified_at              := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: any attempt to move a privileged column is an error, not a silent
  -- no-op, so the caller cannot mistake it for success.
  IF NEW.org_id                        IS DISTINCT FROM OLD.org_id
  OR NEW.tier                          IS DISTINCT FROM OLD.tier
  OR NEW.plan_expires_at               IS DISTINCT FROM OLD.plan_expires_at
  OR NEW.is_admin                      IS DISTINCT FROM OLD.is_admin
  OR NEW.team_role                     IS DISTINCT FROM OLD.team_role
  OR NEW.bonus_runs                    IS DISTINCT FROM OLD.bonus_runs
  OR NEW.is_beta_tester                IS DISTINCT FROM OLD.is_beta_tester
  OR NEW.is_expert                     IS DISTINCT FROM OLD.is_expert
  OR NEW.purchased_credits             IS DISTINCT FROM OLD.purchased_credits
  OR NEW.included_credits_used         IS DISTINCT FROM OLD.included_credits_used
  OR NEW.included_credits_reset_at     IS DISTINCT FROM OLD.included_credits_reset_at
  OR NEW.genesis_uses_this_month       IS DISTINCT FROM OLD.genesis_uses_this_month
  OR NEW.genesis_month_reset_at        IS DISTINCT FROM OLD.genesis_month_reset_at
  OR NEW.bonus_genesis_uses            IS DISTINCT FROM OLD.bonus_genesis_uses
  OR NEW.stripe_payment_method_id      IS DISTINCT FROM OLD.stripe_payment_method_id
  OR NEW.processing_restricted         IS DISTINCT FROM OLD.processing_restricted
  OR NEW.processing_restricted_at      IS DISTINCT FROM OLD.processing_restricted_at
  OR NEW.processing_restriction_reason IS DISTINCT FROM OLD.processing_restriction_reason
  OR NEW.legal_consented_at            IS DISTINCT FROM OLD.legal_consented_at
  OR NEW.legal_consent_version         IS DISTINCT FROM OLD.legal_consent_version
  OR NEW.email_2fa_enabled             IS DISTINCT FROM OLD.email_2fa_enabled
  OR NEW.totp_enabled                  IS DISTINCT FROM OLD.totp_enabled
  OR NEW.totp_secret                   IS DISTINCT FROM OLD.totp_secret
  OR NEW.totp_verified_at              IS DISTINCT FROM OLD.totp_verified_at
  OR NEW.id                            IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION
      'profiles: entitlement, billing, security and privilege columns are server-managed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 2 — runtime- and billing-owned tables become client-read-only
--
-- Every write to these tables comes from service-role server code (the Next.js
-- API routes and the Python runtime). The browser only ever SELECTs them —
-- logs-client.tsx, run-log-live.tsx and EditorShell.tsx read runs and
-- node_executions for the live run view, and nothing else touches them. The
-- write policies were latent attack surface with no caller.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── node_executions ────────────────────────────────────────────────────────
-- Client UPDATE here let a user rewrite `output_payload` on a running workflow.
-- The runtime feeds each node's output into subsequent nodes, so that was a
-- direct injection path into an in-flight execution.
DROP POLICY IF EXISTS "own node_executions" ON public.node_executions;

CREATE POLICY "members read node_executions" ON public.node_executions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.runs r
      WHERE r.id = run_id AND public.can_view_program(r.program_id)
    )
  );

-- ─── approvals ──────────────────────────────────────────────────────────────
-- Client UPDATE let a user set status = 'approved' directly, bypassing the
-- human-approval gate that supervised execution mode exists to enforce.
-- Decisions go through /api/approvals/[id].
DROP POLICY IF EXISTS "own approvals" ON public.approvals;

CREATE POLICY "read own approvals" ON public.approvals
  FOR SELECT USING (auth.uid() = user_id);

-- ─── usage ──────────────────────────────────────────────────────────────────
-- Client write let a user zero their own execution_count / program_count, or
-- insert a fabricated period row, to slip past plan quota checks.
DROP POLICY IF EXISTS "own usage" ON public.usage;

CREATE POLICY "read own usage" ON public.usage
  FOR SELECT USING (auth.uid() = user_id);

-- ─── runs ───────────────────────────────────────────────────────────────────
-- 20240021 replaced the original policy with role-aware INSERT/UPDATE, but the
-- client still had no reason to write runs: they are created by /api/runs and
-- advanced by the runtime. UPDATE also exposed `total_tokens` and
-- `estimated_cost_usd`, the columns the cost-tracking and 10x agent markup bill
-- from, so a user could zero out their own usage after the fact.
DROP POLICY IF EXISTS "runners create runs" ON public.runs;
DROP POLICY IF EXISTS "runners update own runs" ON public.runs;

-- ─── resource_locks ─────────────────────────────────────────────────────────
-- The old policy's `locked_by_run_id IS NULL OR ...` disjunction matched every
-- unattached lock row for every user, so any user could delete unattached locks
-- or insert rows that block other tenants' runs on the same resource key.
DROP POLICY IF EXISTS "own resource_locks" ON public.resource_locks;

CREATE POLICY "read own resource_locks" ON public.resource_locks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.runs r
      JOIN public.programs p ON p.id = r.program_id
      WHERE r.id = locked_by_run_id AND p.user_id = auth.uid()
    )
  );

-- Belt and braces: strip the table-level write grants too, so these stay
-- read-only for clients even if a policy is re-added later.
REVOKE INSERT, UPDATE, DELETE ON
  public.node_executions,
  public.approvals,
  public.usage,
  public.runs,
  public.resource_locks
FROM anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 3 — credential rows: keep the vault pointer server-owned
--
-- `connections` and `api_keys` hold `vault_secret_id`, the pointer the runtime
-- dereferences to decrypt a provider credential. The 20240021 contributor
-- policies correctly scope writes to the workspace, but a contributor could
-- still UPDATE their own row's `vault_secret_id` to a secret id belonging to
-- another workspace and have the runtime decrypt and use it on their behalf.
-- `is_valid` mattered too: flipping it back to true re-arms a credential the
-- system had already marked dead.
--
-- These rows are created and maintained by the OAuth callback and key-validation
-- routes under service_role; the client only renames and deletes them.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE ON public.connections, public.api_keys FROM anon, authenticated;

GRANT INSERT (id, user_id, org_id, workspace_id, name, provider, auth_type, scopes, metadata)
  ON public.connections TO authenticated;
GRANT UPDATE (name, metadata, updated_at)
  ON public.connections TO authenticated;

GRANT INSERT (id, user_id, org_id, workspace_id, name, provider)
  ON public.api_keys TO authenticated;
GRANT UPDATE (name)
  ON public.api_keys TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 4 — auto_recharge_configs: last_triggered_at is a server rate limit
--
-- `last_triggered_at` is what stops auto-recharge firing more than once per
-- 24 h. Under the old FOR ALL policy a user could clear it and trigger repeated
-- charges against their own saved card, defeating the guard rail.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "arc_upsert_own" ON auto_recharge_configs;

CREATE POLICY "arc_insert_own" ON auto_recharge_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "arc_update_own" ON auto_recharge_configs
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "arc_delete_own" ON auto_recharge_configs
  FOR DELETE USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE ON public.auto_recharge_configs FROM anon, authenticated;

-- Current column names: 20260531150000 migrated this table from the USD-
-- denominated threshold_usd / recharge_amount_usd to credit units.
GRANT INSERT (user_id, is_enabled, threshold_credits, recharge_credits, updated_at)
  ON public.auto_recharge_configs TO authenticated;
GRANT UPDATE (is_enabled, threshold_credits, recharge_credits, updated_at)
  ON public.auto_recharge_configs TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 5 — admin_search_users: back the admin email autocomplete
--
-- Emails live in auth.users, which PostgREST does not expose, so the admin UI
-- previously paged through the GoTrue admin API and filtered in JS — meaning it
-- only ever searched the first page of accounts. This SECURITY DEFINER function
-- does the match in the database against all users.
--
-- It is service_role-only: the calling route authenticates the admin first
-- (isAdmin) and then invokes this with the service client, so the function is
-- never reachable with an end-user JWT.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_search_users(p_query TEXT, p_limit INT DEFAULT 8)
RETURNS TABLE (id UUID, email TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.email::TEXT, u.created_at
  FROM auth.users u
  WHERE btrim(p_query) <> ''
    -- `\` and the LIKE wildcards are escaped so an admin typing them searches
    -- for the literal character instead of widening the match.
    AND u.email ILIKE '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  ORDER BY
    -- Exact match first, then prefix matches, then the rest alphabetically.
    (lower(u.email) = lower(btrim(p_query))) DESC,
    (u.email ILIKE replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%') DESC,
    u.email ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 25);
$$;

REVOKE ALL ON FUNCTION public.admin_search_users(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_users(TEXT, INT) TO service_role;

-- A trigram index turns the ILIKE '%…%' sequential scan into an index scan.
-- Purely an optimisation, and it touches the auth schema, which belongs to
-- supabase_auth_admin rather than the migration role — so a permission failure
-- (or pg_trgm living in a schema outside this search_path) must not take the
-- rest of the migration down with it. The function is correct either way.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS users_email_trgm_idx
    ON auth.users USING gin (email gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE
    'Skipped users_email_trgm_idx (%). admin_search_users still works; it just scans auth.users.',
    SQLERRM;
END $$;
