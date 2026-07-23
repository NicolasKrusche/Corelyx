-- Migration: Per-program cost & token analytics RPC functions
-- Created: 2026-07-22
--
-- Provides aggregated analytics data for the per-program analytics dashboard.
-- All functions are scoped to a single program_id and return data for the
-- authenticated user (RLS enforced via run ownership → program → user).

-- ============================================================================
-- 1. Cost trend: one row per completed run with cost & token totals
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
    COALESCE(r.estimated_cost_usd, 0),
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

-- ============================================================================
-- 2. Cost by node type: aggregated across all runs for a program
-- ============================================================================

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
    COALESCE(SUM(ne.estimated_cost_usd), 0) AS total_cost_usd,
    COALESCE(AVG(ne.total_tokens), 0) AS avg_tokens,
    COALESCE(AVG(ne.estimated_cost_usd), 0) AS avg_cost_usd
  FROM node_executions ne
  JOIN runs r ON r.id = ne.run_id
  WHERE r.program_id = p_program_id
    AND ne.status IN ('completed', 'failed')
  GROUP BY node_type
  ORDER BY total_cost_usd DESC;
$$;

-- ============================================================================
-- 3. Model comparison: aggregated from llm_usage_logs for a program's runs
-- ============================================================================

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
    COALESCE(SUM(l.estimated_cost_usd), 0) AS total_cost_usd,
    COALESCE(AVG(l.estimated_cost_usd), 0) AS avg_cost_per_call,
    COALESCE(l.source, 'workflow') AS source
  FROM llm_usage_logs l
  JOIN runs r ON r.id = l.run_id
  WHERE r.program_id = p_program_id
  GROUP BY l.model, l.source
  ORDER BY total_cost_usd DESC;
$$;

-- ============================================================================
-- 4. Summary stats for the program analytics header
-- ============================================================================

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
    COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
    COALESCE(SUM(total_tokens), 0) AS total_tokens,
    COALESCE(SUM(model_call_count), 0) AS total_model_calls,
    COALESCE(AVG(estimated_cost_usd) FILTER (WHERE status IN ('completed', 'failed')), 0) AS avg_cost_per_run,
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

-- Revoke from public; these are called via the service-role client after
-- verifying program access in the web app.
REVOKE EXECUTE ON FUNCTION program_cost_trend(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION program_cost_by_node_type(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION program_model_comparison(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION program_analytics_summary(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION program_cost_trend(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION program_cost_by_node_type(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION program_model_comparison(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION program_analytics_summary(UUID) TO service_role;
