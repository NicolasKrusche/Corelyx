-- Migration: user-facing billed cost on runs
-- Created: 2026-08-02
--
-- runs.estimated_cost_usd is the RAW provider cost and must never be shown to
-- users — it leaks the platform margin. This adds runs.billed_cost_usd, the
-- cost as the user experiences it:
--   * platform-key calls: the marked-up charge (llm_usage_logs.billed_credits,
--     1000 credits = $1)
--   * BYOK/free calls: the raw provider cost passes through (the user pays
--     their own provider directly; there is no markup to apply or margin to hide)
-- The runtime writes it per run going forward (run telemetry); user-facing
-- surfaces (the /runs "Ask about your runs" query, etc.) read this column.

ALTER TABLE public.runs
ADD COLUMN IF NOT EXISTS billed_cost_usd NUMERIC(14,6) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.runs.billed_cost_usd IS
  'User-facing run cost in USD: marked-up platform charges (billed_credits/1000) plus raw pass-through cost of BYOK/free calls. estimated_cost_usd stays RAW provider cost (admin-only).';

-- ── Backfill from the per-call audit log ────────────────────────────────────
-- node_id IS NOT NULL filters out the stray duplicate "base" rows written by
-- the pre-2026-07-28 double-insert bug (those rows carry no node_id and would
-- double-count cost).
UPDATE public.runs r
SET billed_cost_usd = ROUND(u.billed::numeric, 6)
FROM (
  SELECT
    run_id,
    SUM(
      CASE
        WHEN billing = 'platform' AND billed_credits > 0
          THEN billed_credits / 1000.0
        ELSE COALESCE(estimated_cost_usd, 0)
      END
    ) AS billed
  FROM public.llm_usage_logs
  WHERE run_id IS NOT NULL
    AND node_id IS NOT NULL
  GROUP BY run_id
) u
WHERE u.run_id = r.id
  AND u.billed > 0;

-- Runs that predate per-call usage logging (or whose logging failed) have no
-- audit rows to derive from. Assume platform billing and apply the standard
-- markup (PLATFORM_MARKUP = 10 in apps/runtime/engine/executor.py): erring
-- toward the marked-up figure is the requirement — users must never see raw
-- platform cost as their own.
UPDATE public.runs
SET billed_cost_usd = ROUND((estimated_cost_usd * 10)::numeric, 6)
WHERE billed_cost_usd = 0
  AND estimated_cost_usd > 0;
