-- 2026-07-28 — remove the duplicate llm_usage_logs rows left by the
-- _log_llm_usage double-write.
--
-- Background
-- ----------
-- apps/runtime/engine/executor.py::_log_llm_usage writes an "enriched" row
-- (node_id / source / billing / billed_credits set) and, when those columns are
-- missing, falls back to a "base" row without them. The fallback INSERT sat
-- AFTER the try/except instead of inside it, so the success path fell through
-- and ran BOTH — two rows per LLM call.
--
-- The stray row did not look wrong: source, billing and billed_credits are
-- NOT NULL DEFAULT (20260708120000), so Postgres backfilled it into a complete,
-- plausible record carrying the SAME estimated_cost_usd and total_tokens as its
-- twin. Only node_id was left NULL.
--
-- Nothing in the read path filters on node_id, so admin_llm_finance_summary's
-- COUNT(*) / SUM(total_tokens) / SUM(estimated_cost_usd) all double-counted:
-- platform LLM cost on /admin/finances read 2x reality and gross margin was
-- understated. billed_credits was unaffected (the stray row defaults to 0), so
-- revenue was correct — only the cost side was wrong.
--
-- Ordering: the code fix ships with this migration. Run this AFTER the Railway
-- runtime redeploy — otherwise the old runtime keeps emitting new strays and
-- you will need to run it again. Re-running is harmless; it is idempotent.
--
-- Safety
-- ------
-- This deliberately does NOT delete on `node_id IS NULL`. Genesis calls are
-- logged with source='genesis' from apps/web/lib/llm-usage-log.ts and are not
-- tied to a workflow node, so they legitimately carry a NULL node_id and MUST
-- be kept. A stray is removed only when an enriched TWIN exists with identical
-- user / run / workspace / model / token / cost values. Rows are paired 1:1 by
-- row_number, so at most one stray is dropped per enriched row — if the counts
-- are ever uneven the surplus survives rather than being over-deleted.
--
-- Every deleted row is copied to llm_usage_logs_dedupe_archive first, so this
-- is reversible (see the restore snippet at the bottom).
--
-- Dry-run against production on 2026-07-28 predicted: 100 rows -> 50 deleted,
-- 0 strays kept, total cost 0.220312 -> 0.110156 (== the enriched-only sum).


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 1 — identify the strays, paired 1:1 to their enriched twins
--
-- A TEMP table (not a view) so this working set is never visible to PostgREST.
-- Deliberately NOT `ON COMMIT DROP`: that only survives if the whole script
-- runs as one transaction, and a per-statement-autocommit runner would drop it
-- before the DO block below could read it. It is dropped explicitly at the end
-- instead, which is correct under either model. The leading DROP clears a
-- leftover from an earlier aborted run in the same session.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS llm_usage_dedupe_doomed;

CREATE TEMP TABLE llm_usage_dedupe_doomed AS
WITH keyed AS (
  SELECT
    id,
    node_id,
    created_at,
    -- Nullable columns are coalesced to a sentinel: NULL = NULL never matches.
    concat_ws(
      '|',
      coalesce(user_id::text, '~'),
      coalesce(run_id::text, '~'),
      coalesce(workspace_id::text, '~'),
      coalesce(model, '~'),
      coalesce(prompt_tokens, 0),
      coalesce(completion_tokens, 0),
      coalesce(total_tokens, 0),
      coalesce(estimated_cost_usd, 0)
    ) AS match_key
  FROM public.llm_usage_logs
),
enriched AS (
  SELECT id, match_key,
         row_number() OVER (PARTITION BY match_key ORDER BY created_at, id) AS rn
  FROM keyed WHERE node_id IS NOT NULL
),
stray AS (
  SELECT id, match_key,
         row_number() OVER (PARTITION BY match_key ORDER BY created_at, id) AS rn
  FROM keyed WHERE node_id IS NULL
)
SELECT s.id
FROM stray s
JOIN enriched e ON e.match_key = s.match_key AND e.rn = s.rn;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 2 — archive, then delete
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.llm_usage_logs_dedupe_archive
  (LIKE public.llm_usage_logs INCLUDING DEFAULTS);

-- Appended last, so `SELECT l.*, now()` below lines up positionally.
ALTER TABLE public.llm_usage_logs_dedupe_archive
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- An archive of billing rows must never be client-readable. RLS with no policy
-- denies everything; the REVOKE strips the default Supabase table grants too.
ALTER TABLE public.llm_usage_logs_dedupe_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.llm_usage_logs_dedupe_archive FROM anon, authenticated;

DO $$
DECLARE
  v_before  BIGINT;
  v_doomed  BIGINT;
  v_deleted BIGINT;
  v_kept    BIGINT;
BEGIN
  SELECT count(*) INTO v_before FROM public.llm_usage_logs;
  SELECT count(*) INTO v_doomed FROM llm_usage_dedupe_doomed;

  -- Columns listed explicitly rather than `l.*`: run_id and workspace_id were
  -- appended late (20260722110000), so they sit at positions 13/14, not next to
  -- user_id. Positional inserts would silently shove a uuid into `model`.
  INSERT INTO public.llm_usage_logs_dedupe_archive (
    id, user_id, model, prompt_tokens, completion_tokens, total_tokens,
    estimated_cost_usd, created_at, source, billing, billed_credits,
    node_id, run_id, workspace_id
  )
  SELECT
    l.id, l.user_id, l.model, l.prompt_tokens, l.completion_tokens, l.total_tokens,
    l.estimated_cost_usd, l.created_at, l.source, l.billing, l.billed_credits,
    l.node_id, l.run_id, l.workspace_id
  FROM public.llm_usage_logs l
  WHERE l.id IN (SELECT id FROM llm_usage_dedupe_doomed);

  DELETE FROM public.llm_usage_logs
  WHERE id IN (SELECT id FROM llm_usage_dedupe_doomed);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_kept
  FROM public.llm_usage_logs WHERE node_id IS NULL;

  RAISE NOTICE 'dedupe: % rows before, % identified, % deleted (archived).',
    v_before, v_doomed, v_deleted;
  RAISE NOTICE 'NULL-node_id rows intentionally KEPT (no enriched twin, e.g. Genesis): %.',
    v_kept;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 3 — verify
--
-- Expect: rows halved, null-node_id count 0 (until Genesis logs some), and the
-- cost total equal to the enriched-only sum.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_total    BIGINT;
  v_enriched BIGINT;
  v_null     BIGINT;
  v_cost     NUMERIC;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE node_id IS NOT NULL),
         count(*) FILTER (WHERE node_id IS NULL),
         coalesce(sum(estimated_cost_usd), 0)
    INTO v_total, v_enriched, v_null, v_cost
  FROM public.llm_usage_logs;

  RAISE NOTICE 'llm_usage_logs now: % rows (% enriched, % null-node_id), total cost %.',
    v_total, v_enriched, v_null, v_cost;
END $$;

DROP TABLE IF EXISTS llm_usage_dedupe_doomed;


-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback, if the numbers look wrong
-- ═══════════════════════════════════════════════════════════════════════════
--
--   INSERT INTO public.llm_usage_logs (
--     id, user_id, model, prompt_tokens, completion_tokens, total_tokens,
--     estimated_cost_usd, created_at, source, billing, billed_credits,
--     node_id, run_id, workspace_id
--   )
--   SELECT
--     id, user_id, model, prompt_tokens, completion_tokens, total_tokens,
--     estimated_cost_usd, created_at, source, billing, billed_credits,
--     node_id, run_id, workspace_id
--   FROM public.llm_usage_logs_dedupe_archive;
--
-- Once you are satisfied, the archive can be dropped:
--
--   DROP TABLE public.llm_usage_logs_dedupe_archive;
