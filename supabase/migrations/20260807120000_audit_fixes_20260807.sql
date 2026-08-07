-- ═══════════════════════════════════════════════════════════════════════════
-- Audit fixes, 2026-08-07.
--
-- One migration covering everything found reviewing the recent commits plus the
-- browse surface. Sections are independent and ordered by severity; the whole
-- file is idempotent and safe to re-run.
--
--   1. CRITICAL — published programs were readable ROW-WHOLE by anon, which
--      exposed `schema` (holding the author's live HTTP auth values, agent
--      api_key_refs, webhook endpoint ids and device ids).
--   2. increment_fork_count was an unauthenticated write on a tenant table,
--      callable against any program id.
--   3. Two dead-letter admin functions silently ignored their program filter,
--      so a scoped purge hit every program; a third could never run at all.
--   4. Spending a Genesis bonus generation was a read-modify-write, so
--      concurrent requests all spent the same last unit.
--   5. Realtime pushed raw provider cost (estimated_cost_usd) to the browser
--      on every run/node_execution change.
--
-- Section 5 is the only one whose effect depends on live database state (which
-- tables are in the supabase_realtime publication, and their replica identity);
-- it is written to no-op rather than guess when that state isn't what it
-- expects. Verify live updates still work on the run page after applying.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 1: stop anon reading published program rows directly.
--
-- 20240004_marketplace.sql created:
--
--   CREATE POLICY "Public programs are readable by everyone"
--     ON programs FOR SELECT USING (is_public = true);
--
-- with no TO clause, which defaults to PUBLIC — including the anon role whose
-- key ships in the browser. RLS is row-granular, not column-granular, so that
-- policy exposed the ENTIRE row of every published program, not the handful of
-- listing fields Browse actually shows: `schema` (which still holds the
-- author's real HTTP auth values, agent api_key_refs, webhook endpoint ids and
-- device ids — publishing deliberately no longer rewrites it), plus user_id,
-- workspace_id and the governance columns ai_act_notes / reviewer /
-- prohibited_reason / legal_review_override.
--
-- Both browse readers already withhold the schema and derive a node summary
-- instead, so the policy bought nothing: every public-program read in the app
-- goes through a service-role client in a server route
-- (app/(app)/browse/page.tsx, app/api/browse/route.ts, app/api/browse/[id]/fork,
-- app/u/[username]/page.tsx, app/api/u/[username]/route.ts), and service_role
-- bypasses RLS entirely. Owners and workspace members keep their access through
-- the "members read programs" policy from 20240021_workspace_program_scope.sql,
-- which is untouched here.
DROP POLICY IF EXISTS "Public programs are readable by everyone" ON public.programs;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 2: increment_fork_count must not be callable by anon.
--
-- It is SECURITY DEFINER (so it bypasses RLS by design, to bump a counter on a
-- row the forker cannot otherwise write) but 20240004_marketplace.sql never
-- revoked the default EXECUTE grant to PUBLIC. Anyone holding the browser's
-- anon key could POST /rest/v1/rpc/increment_fork_count with any program id —
-- public or private — and inflate the counter at will, which is both an
-- unauthenticated write to a tenant table and a way to own the top of Browse's
-- "Popular" sort. Every other RPC in this tree is locked down this way; this one
-- was missed.
--
-- Pinning search_path at the same time: a SECURITY DEFINER function without it
-- resolves unqualified names through the caller's search_path.
CREATE OR REPLACE FUNCTION public.increment_fork_count(program_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.programs SET fork_count = fork_count + 1 WHERE id = program_id;
$$;

REVOKE ALL ON FUNCTION public.increment_fork_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_fork_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.increment_fork_count(UUID) FROM authenticated;
-- The fork route calls this with the service key; grant that explicitly rather
-- than relying on Supabase's ambient default privileges.
GRANT EXECUTE ON FUNCTION public.increment_fork_count(UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 3: make the dead-letter admin functions honour their program filter.
--
-- Both were written as `WHERE program_id = COALESCE(program_id, program_id)`.
-- In a LANGUAGE sql function the COLUMN name shadows the parameter of the same
-- name, so that expression compares the column to itself — always true for a
-- NOT NULL column. admin_dead_letter_stats returned global stats for any
-- program id, and admin_purge_old_dead_letters purged EVERY program's entries
-- regardless of the id passed. Nothing calls either function today, which is
-- the only reason this has not destroyed data.
--
-- The parameters are renamed with a p_ prefix (the convention used by every
-- later migration) so the shadowing cannot recur, and the old signatures are
-- dropped since renaming a parameter is not something CREATE OR REPLACE can do.
-- Both keep their original semantics exactly: the stats are status-based, and
-- the purge stays a SOFT purge (status = 'purged'), not a delete.
DROP FUNCTION IF EXISTS public.admin_dead_letter_stats(UUID);
DROP FUNCTION IF EXISTS public.admin_purge_old_dead_letters(INT, UUID);

CREATE FUNCTION public.admin_dead_letter_stats(p_program_id UUID DEFAULT NULL)
RETURNS TABLE (
    total BIGINT,
    pending BIGINT,
    retried BIGINT,
    resolved BIGINT,
    purged BIGINT,
    oldest_entry TIMESTAMPTZ,
    newest_entry TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT
        COUNT(*)::BIGINT AS total,
        COUNT(*) FILTER (WHERE status = 'pending')::BIGINT AS pending,
        COUNT(*) FILTER (WHERE status = 'retried')::BIGINT AS retried,
        COUNT(*) FILTER (WHERE status = 'resolved')::BIGINT AS resolved,
        COUNT(*) FILTER (WHERE status = 'purged')::BIGINT AS purged,
        MIN(created_at) AS oldest_entry,
        MAX(created_at) AS newest_entry
    FROM public.dead_letter_entries
    WHERE p_program_id IS NULL OR program_id = p_program_id;
$$;

-- The old body ended in `RETURNING 1` from a LANGUAGE sql function declared
-- RETURNS INT, so it reported 1 whenever it touched anything and NULL when it
-- touched nothing — never the number purged. plpgsql + ROW_COUNT reports the
-- real figure, which is what a caller deciding whether to purge again needs.
CREATE FUNCTION public.admin_purge_old_dead_letters(
    p_older_than_days INT DEFAULT 30,
    p_program_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_purged INT;
BEGIN
    UPDATE public.dead_letter_entries
    SET status = 'purged', updated_at = NOW()
    WHERE created_at < NOW() - (p_older_than_days || ' days')::INTERVAL
      AND status != 'purged'
      AND (p_program_id IS NULL OR program_id = p_program_id);
    GET DIAGNOSTICS v_purged = ROW_COUNT;
    RETURN v_purged;
END;
$$;

-- admin_retrigger_dead_letter goes entirely: it could never have run. The body
-- inserts `node_executions.input_data` and `runs.trigger_type`, and neither
-- column exists (node_executions has `input_payload`; runs has no trigger_type
-- at all), so every call raised inside Postgres and surfaced as a 500 from
-- /api/programs/[id]/dead-letter. plpgsql only resolves those names at call
-- time, which is why the migration that created it applied cleanly.
--
-- Even with the columns corrected it would still have been wrong: it wrote a
-- 'running' run row and a 'pending' node_executions row, but nothing dispatched
-- to the runtime and nothing polls for pending executions, so the run would
-- have hung in 'running' forever. Retriggering now delegates to
-- /api/runs/[id]/replay-from-node, which is the dispatch path already under
-- test. Dropped rather than repaired so it cannot be wired up again.
DROP FUNCTION IF EXISTS public.admin_retrigger_dead_letter(UUID, UUID);

REVOKE EXECUTE ON FUNCTION public.admin_dead_letter_stats(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_purge_old_dead_letters(INT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dead_letter_stats(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_purge_old_dead_letters(INT, UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 4: make spending a Genesis bonus generation atomic.
--
-- lib/limits.ts decided whether a generation was bonus-funded by READING
-- bonus_genesis_uses, then later wrote back `bonus_genesis_uses - 1` computed
-- from that same snapshot. Two requests arriving together both read 1, both ran
-- free, and both wrote 0 — a pool of one funded as many concurrent generations
-- as the 10/min rate limiter allowed, each on any model in the catalog at
-- platform expense. That read-modify-write predates the credit migration, but
-- it only started gating money when 1b7faa5 made the bonus pool the thing that
-- decides whether a generation is charged at all.
--
-- A single guarded UPDATE settles it in the database: exactly one caller can
-- take the last unit, and the loser is charged credits like anyone else.
-- ═══════════════════════════════════════════════════════════════════════════

-- Returns TRUE only if this call is the one that claimed a unit.
-- p_workspace_id mirrors getBillingScope: workspace-billed accounts hold the
-- pool on `workspaces`, personal accounts on `profiles`.
CREATE OR REPLACE FUNCTION public.consume_genesis_bonus(
  p_user_id      UUID,
  p_workspace_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed INT;
BEGIN
  IF p_workspace_id IS NOT NULL THEN
    UPDATE public.workspaces
    SET bonus_genesis_uses = bonus_genesis_uses - 1
    WHERE id = p_workspace_id AND bonus_genesis_uses > 0;
  ELSE
    UPDATE public.profiles
    SET bonus_genesis_uses = bonus_genesis_uses - 1
    WHERE id = p_user_id AND bonus_genesis_uses > 0;
  END IF;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed > 0;
END;
$$;

-- Hands a claimed unit back when the generation it was claimed for never
-- happened, so a provider outage doesn't quietly eat a user's free generation.
-- Deliberately unbounded on the upside: the only caller passes back a unit it
-- just took, and capping it against a plan figure would need a tier lookup this
-- function has no business doing.
CREATE OR REPLACE FUNCTION public.refund_genesis_bonus(
  p_user_id      UUID,
  p_workspace_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_workspace_id IS NOT NULL THEN
    UPDATE public.workspaces
    SET bonus_genesis_uses = bonus_genesis_uses + 1
    WHERE id = p_workspace_id;
  ELSE
    UPDATE public.profiles
    SET bonus_genesis_uses = bonus_genesis_uses + 1
    WHERE id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_genesis_bonus(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_genesis_bonus(UUID, UUID) FROM PUBLIC, anon, authenticated;
-- Money path: called only from server routes holding the service key.
GRANT EXECUTE ON FUNCTION public.consume_genesis_bonus(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_genesis_bonus(UUID, UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 5: stop Realtime pushing raw provider cost to the browser.
--
-- `billed_cost_usd` is the only user-facing cost figure; `estimated_cost_usd`
-- is the raw provider cost, and the platform markup is trivially derived from
-- the pair. The run page's polling query was fixed to select an explicit column
-- list, but the Realtime subscription on the same screen still received whole
-- rows over the websocket — every UPDATE delivered the raw cost sitting next to
-- the billed cost it is rendered from.
--
-- Postgres 15 publication column lists fix this at the source: the WAL decoder
-- only emits the listed columns, so no client of these tables can receive the
-- others no matter how it subscribes.
--
-- Column lists are legal only when they cover the table's replica identity. A
-- table left at REPLICA IDENTITY FULL has every column in its identity, which
-- would make ALTER PUBLICATION fail outright, so those are moved to DEFAULT
-- (the primary key) first. That changes what UPDATE/DELETE events carry as the
-- OLD record — safe here because every subscriber reads `payload.new` only:
--   - programs/[id]/runs/[runId]/run-log-live.tsx  (new → normalizeNodeExecutionRow / status)
--   - components/editor/EditorShell.tsx            (new → applyExecRow / status)
--   - (app)/logs/logs-client.tsx                   (payload ignored; refetches)
--
-- Each table is touched only if it is already published. Realtime membership is
-- managed from the Supabase dashboard rather than in this tree, so adding a
-- table here would silently switch live updates ON for something that had them
-- off — the opposite of the intent.
--
-- The listed columns must cover what subscribers read AND what the SELECT
-- policies need to authorize the row:
--   - runs            → "members read runs": can_view_program(program_id)
--   - node_executions → "members read node_executions": joins runs on run_id
-- Dropping program_id / run_id would make Realtime unable to authorize and the
-- subscription would go quiet.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_ident "char";
BEGIN
  -- ── runs ────────────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'runs'
  ) THEN
    SELECT relreplident INTO v_ident FROM pg_class WHERE oid = 'public.runs'::regclass;
    IF v_ident = 'f' THEN
      ALTER TABLE public.runs REPLICA IDENTITY DEFAULT;
    END IF;

    ALTER PUBLICATION supabase_realtime DROP TABLE public.runs;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.runs (
      id,
      program_id,
      status,
      triggered_by,
      started_at,
      completed_at,
      error_message,
      created_at,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      billed_cost_usd,
      connector_api_calls,
      model_call_count
    );
    -- Deliberately omitted: estimated_cost_usd (raw provider cost) and
    -- trigger_payload (arbitrary user/webhook data no subscriber reads).
  END IF;

  -- ── node_executions ─────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'node_executions'
  ) THEN
    SELECT relreplident INTO v_ident FROM pg_class WHERE oid = 'public.node_executions'::regclass;
    IF v_ident = 'f' THEN
      ALTER TABLE public.node_executions REPLICA IDENTITY DEFAULT;
    END IF;

    ALTER PUBLICATION supabase_realtime DROP TABLE public.node_executions;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.node_executions (
      id,
      run_id,
      node_id,
      status,
      input_payload,
      output_payload,
      error_message,
      retry_count,
      started_at,
      completed_at,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      billed_cost_usd,
      connector_api_calls,
      model_call_count,
      created_at
    );
    -- Deliberately omitted: estimated_cost_usd (raw provider cost).
  END IF;
END
$$;
