-- Migration: user-facing billed cost on node_executions + billed analytics RPCs
-- Created: 2026-08-02
--
-- Companion to 20260802120000_runs_billed_cost.sql, which added the run-level
-- billed_cost_usd. Node-level surfaces (run log, execution replay, per-node
-- analytics) still read node_executions.estimated_cost_usd — RAW provider
-- cost, which must never be shown to users. This adds the node-level billed
-- column with the same semantics:
--   * platform-key calls: the marked-up charge (llm_usage_logs.billed_credits,
--     1000 credits = $1)
--   * BYOK/free calls: raw provider cost passes through
-- The runtime writes it per node going forward (_node_telemetry_payload).
-- update_node_execution in apps/runtime/db.py tolerates the column being
-- missing, so deploy order (runtime vs migration) does not matter.

ALTER TABLE public.node_executions
ADD COLUMN IF NOT EXISTS billed_cost_usd NUMERIC(14,6) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.node_executions.billed_cost_usd IS
  'User-facing node cost in USD: marked-up platform charges (billed_credits/1000) plus raw pass-through cost of BYOK/free calls. estimated_cost_usd stays RAW provider cost (admin-only).';

-- ── Backfill from the per-call audit log ────────────────────────────────────
UPDATE public.node_executions ne
SET billed_cost_usd = ROUND(u.billed::numeric, 6)
FROM (
  SELECT
    run_id,
    node_id,
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
  GROUP BY run_id, node_id
) u
WHERE u.run_id = ne.run_id
  AND u.node_id = ne.node_id
  AND u.billed > 0;

-- Node rows that predate per-call usage logging: assume platform billing and
-- apply the standard markup (PLATFORM_MARKUP = 10), same rationale as the
-- run-level backfill — err toward the marked-up figure, never expose raw cost.
UPDATE public.node_executions
SET billed_cost_usd = ROUND((estimated_cost_usd * 10)::numeric, 6)
WHERE billed_cost_usd = 0
  AND estimated_cost_usd > 0;

-- ============================================================================
-- usage_records.billed_amount backfill
-- ============================================================================
-- The column has existed since 20260723150000 but nothing ever wrote it, so
-- every row sits at its DEFAULT 0. The billing usage endpoint now reads it
-- (raw estimated_cost_usd leaks the margin), and the runtime writes it going
-- forward — but historical rows would read as $0 without this.

UPDATE public.usage_records u
SET billed_amount = ROUND(r.billed_cost_usd::numeric, 6)
FROM public.runs r
WHERE r.id = u.run_id
  AND u.billed_amount = 0
  AND r.billed_cost_usd > 0;

-- Rows with no surviving run to derive from: assume platform billing and apply
-- the standard markup, same rationale as the run-level backfill.
UPDATE public.usage_records
SET billed_amount = ROUND((estimated_cost_usd * 10)::numeric, 6)
WHERE billed_amount = 0
  AND billing = 'platform'
  AND estimated_cost_usd > 0;

-- BYOK: the user pays their provider directly, so raw cost passes through.
UPDATE public.usage_records
SET billed_amount = estimated_cost_usd
WHERE billed_amount = 0
  AND billing = 'byok'
  AND estimated_cost_usd > 0;

-- ============================================================================
-- Analytics RPCs: switch every user-facing cost aggregate to billed columns.
-- These back the per-program analytics dashboard (lib/program-analytics.ts).
-- Function bodies otherwise unchanged from 20260722120000 / 20260724180000.
-- ============================================================================

CREATE OR REPLACE FUNCTION program_cost_trend(
  p_program_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  run_id       UUID,
  status       TEXT,
  started_at   TIMESTAMPTZ,
  cost_usd     NUMERIC,
  prompt_tokens    BIGINT,
  completion_tokens BIGINT,
  total_tokens     BIGINT,
  model_call_count INTEGER,
  duration_ms  NUMERIC
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id,
    r.status,
    r.started_at,
    COALESCE(r.billed_cost_usd, 0),
    COALESCE(r.prompt_tokens, 0),
    COALESCE(r.completion_tokens, 0),
    COALESCE(r.total_tokens, 0),
    COALESCE(r.model_call_count, 0),
    CASE
      WHEN r.started_at IS NOT NULL AND r.completed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (r.completed_at - r.started_at)) * 1000
      ELSE NULL
    END
  FROM runs r
  WHERE r.program_id = p_program_id
    AND r.status IN ('completed', 'failed', 'partial')
    AND r.started_at IS NOT NULL
  ORDER BY r.started_at DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION program_cost_by_node_type(
  p_program_id UUID
)
RETURNS TABLE (
  node_type    TEXT,
  execution_count BIGINT,
  total_tokens    BIGINT,
  total_cost_usd  NUMERIC,
  avg_tokens      NUMERIC,
  avg_cost_usd    NUMERIC
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(
      ne.output_payload->>'type',
      ne.input_payload->>'_node_type',
      'unknown'
    ) AS node_type,
    COUNT(*) AS execution_count,
    COALESCE(SUM(ne.total_tokens), 0) AS total_tokens,
    COALESCE(SUM(ne.billed_cost_usd), 0) AS total_cost_usd,
    COALESCE(AVG(ne.total_tokens), 0) AS avg_tokens,
    COALESCE(AVG(ne.billed_cost_usd), 0) AS avg_cost_usd
  FROM node_executions ne
  JOIN runs r ON r.id = ne.run_id
  WHERE r.program_id = p_program_id
    AND ne.status IN ('completed', 'failed')
  GROUP BY node_type
  ORDER BY total_cost_usd DESC;
$$;

CREATE OR REPLACE FUNCTION program_model_comparison(
  p_program_id UUID
)
RETURNS TABLE (
  model        TEXT,
  call_count   BIGINT,
  total_tokens BIGINT,
  total_cost_usd NUMERIC,
  avg_cost_per_call NUMERIC,
  source       TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    l.model,
    COUNT(*) AS call_count,
    COALESCE(SUM(l.total_tokens), 0) AS total_tokens,
    COALESCE(SUM(
      CASE
        WHEN l.billing = 'platform' AND l.billed_credits > 0
          THEN l.billed_credits / 1000.0
        ELSE COALESCE(l.estimated_cost_usd, 0)
      END
    ), 0) AS total_cost_usd,
    COALESCE(AVG(
      CASE
        WHEN l.billing = 'platform' AND l.billed_credits > 0
          THEN l.billed_credits / 1000.0
        ELSE COALESCE(l.estimated_cost_usd, 0)
      END
    ), 0) AS avg_cost_per_call,
    COALESCE(l.source, 'workflow') AS source
  FROM llm_usage_logs l
  JOIN runs r ON r.id = l.run_id
  WHERE r.program_id = p_program_id
  GROUP BY l.model, l.source
  ORDER BY total_cost_usd DESC;
$$;

CREATE OR REPLACE FUNCTION program_analytics_summary(
  p_program_id UUID
)
RETURNS TABLE (
  total_runs        BIGINT,
  completed_runs    BIGINT,
  failed_runs       BIGINT,
  total_cost_usd    NUMERIC,
  total_tokens      BIGINT,
  total_model_calls BIGINT,
  avg_cost_per_run  NUMERIC,
  avg_tokens_per_run NUMERIC,
  total_duration_ms NUMERIC
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*) AS total_runs,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_runs,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_runs,
    COALESCE(SUM(billed_cost_usd), 0) AS total_cost_usd,
    COALESCE(SUM(total_tokens), 0) AS total_tokens,
    COALESCE(SUM(model_call_count), 0) AS total_model_calls,
    COALESCE(AVG(billed_cost_usd) FILTER (WHERE status IN ('completed', 'failed')), 0) AS avg_cost_per_run,
    COALESCE(AVG(total_tokens) FILTER (WHERE status IN ('completed', 'failed')), 0) AS avg_tokens_per_run,
    COALESCE(SUM(
      CASE
        WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
        ELSE 0
      END
    ), 0) AS total_duration_ms
  FROM runs
  WHERE program_id = p_program_id
    AND started_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION program_token_usage_summary(
  p_program_id UUID
)
RETURNS TABLE (
  node_type       TEXT,
  total_prompt    BIGINT,
  total_completion BIGINT,
  total_tokens    BIGINT,
  total_cost_usd  NUMERIC,
  call_count      BIGINT,
  models_used     TEXT[]
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(
      ne.output_payload->>'type',
      ne.input_payload->>'_node_type',
      'unknown'
    ) AS node_type,
    COALESCE(SUM((ne.token_usage->>'prompt_tokens')::bigint), 0) AS total_prompt,
    COALESCE(SUM((ne.token_usage->>'completion_tokens')::bigint), 0) AS total_completion,
    COALESCE(SUM(ne.total_tokens), 0) AS total_tokens,
    COALESCE(SUM(ne.billed_cost_usd), 0) AS total_cost_usd,
    COUNT(*) AS call_count,
    ARRAY_AGG(DISTINCT COALESCE(ne.token_usage->>'model', 'unknown'))
      FILTER (WHERE ne.token_usage->>'model' IS NOT NULL) AS models_used
  FROM node_executions ne
  JOIN runs r ON r.id = ne.run_id
  WHERE r.program_id = p_program_id
    AND ne.status IN ('completed', 'failed')
    AND ne.token_usage != '{}'::jsonb
  GROUP BY node_type
  ORDER BY total_cost_usd DESC;
$$;

-- Re-assert grants: CREATE OR REPLACE preserves ACLs, but keep this explicit
-- so a from-scratch apply matches the original migrations.
REVOKE EXECUTE ON FUNCTION program_cost_trend(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION program_cost_by_node_type(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION program_model_comparison(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION program_analytics_summary(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION program_token_usage_summary(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION program_cost_trend(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION program_cost_by_node_type(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION program_model_comparison(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION program_analytics_summary(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION program_token_usage_summary(UUID) TO service_role;
