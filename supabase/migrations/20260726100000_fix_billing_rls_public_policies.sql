-- 2026-07-26 — fix billing RLS policies that were open to every authenticated user.
--
-- 20260723150000_hybrid_pricing_billing.sql created three policies whose names
-- and comments say "only service_role", but which have no `TO` clause. Postgres
-- defaults a policy's role list to PUBLIC, and permissive policies are OR'd
-- together — so each of these overrode the carefully scoped policy above it and
-- granted the access to `authenticated` as well:
--
--   CREATE POLICY "service role manages subscriptions"
--     ON org_subscriptions FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "service role insert usage"
--     ON usage_records FOR INSERT WITH CHECK (true);
--
-- Concretely, any signed-in user could hit PostgREST with their own JWT and
-- read, modify or delete ANY organization's subscription row — including
-- setting their own org's plan_id to the top plan, pushing current_period_end
-- years out, or flipping status to 'active' — and could fabricate usage_records
-- rows against any org.
--
-- The policies were never needed in the first place: service_role holds
-- BYPASSRLS, so it is unaffected by RLS entirely, and every billing route
-- (/api/billing/{subscription,usage,plans}, the Stripe webhooks) already goes
-- through createServiceClient(). Dropping them restores the intent.
--
-- 20260724160000_approval_sla_escalation.sql shows the correct form for
-- comparison: `USING (auth.role() = 'service_role')`.


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 1 — org_subscriptions
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "service role manages subscriptions" ON org_subscriptions;

-- Also drop the org-manager UPDATE policy. It is the same class of hole one
-- level down: RLS is row-granular, so "a manager may update their org's
-- subscription row" means a manager may rewrite every column of it — plan_id,
-- status, seats_count, current_period_end, stripe_subscription_id. That is a
-- self-serve upgrade to any plan, for free, straight from the browser console.
--
-- A subscription row is Stripe-owned state. It is written by the checkout route
-- and the Stripe webhook under service_role, and never by a client: there is no
-- non-service-role write to org_subscriptions anywhere in apps/web. Making the
-- table read-only to clients costs the app nothing.
DROP POLICY IF EXISTS "org managers update subscriptions" ON org_subscriptions;

-- What remains: "org members read subscriptions" (SELECT via is_org_member).
-- No INSERT/UPDATE/DELETE policy exists, so RLS denies all three for clients.


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 2 — usage_records
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "service role insert usage" ON usage_records;

-- What remains: "org members read usage" (SELECT via is_org_member). Usage rows
-- are written by the runtime under service_role.


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 3 — belt and braces
--
-- Strip the table-level write grants as well, so these tables stay read-only to
-- clients even if a permissive policy is reintroduced later. This mirrors
-- 20260725130000_client_write_privilege_hardening.sql, and is the reason that
-- migration's protections could not be undone by a single stray policy.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE ON
  public.org_subscriptions,
  public.usage_records,
  public.billing_plans
FROM anon, authenticated;

-- billing_plans is the price list. It already had only a SELECT policy, but the
-- default Supabase grants still handed authenticated table-level write
-- privileges, so revoke those too — a user rewriting seat_price_monthly or
-- flipping is_active would corrupt the public pricing page.


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 4 — org_invites: every invite token was world-readable
--
-- 20260723120000_multi_tenant_orgs.sql:159
--
--   create policy "invite token read for accept"
--     on org_invites for select using (true);
--
-- No TO clause, so this covers anon as well as authenticated. `org_invites` has
-- a `token text not null unique` column, so ANY caller could dump the whole
-- table and read every pending invite token for every organization — then POST
-- one to the accept endpoint and join an org they were never invited to. It also
-- exposed the email address of everyone who has ever been invited.
--
-- The policy's stated reason ("so the invitee can look up their invite before
-- they're a member") does not require it: /api/orgs/invite/[token] resolves the
-- token with createServiceClient(), which bypasses RLS. No client ever reads
-- this table directly.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "invite token read for accept" ON org_invites;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.org_invites FROM anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 5 — templates: private drafts were readable by everyone
--
-- 20260722230000_template_from_run_and_replay_from_node.sql:35
--
--   CREATE POLICY "Users can view all templates"
--     ON public.templates FOR SELECT USING (true);
--
-- The comment above it says "public + their own", but `is_public` defaults to
-- FALSE, so USING (true) published every user's unpublished drafts — including
-- `program_json` (the complete workflow, i.e. whatever business logic it
-- encodes) and `genesis_prompt` — to every other user.
--
-- Restored to the documented intent: a template is readable if it is public and
-- approved for the marketplace, or if you own it. `status` and `user_id` are
-- added by 20260724000000; this migration runs after it, so both exist.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view all templates" ON public.templates;

CREATE POLICY "read public or own templates" ON public.templates
  FOR SELECT USING (
    (is_public AND status = 'approved')
    OR created_by = auth.uid()
    OR user_id = auth.uid()
  );
