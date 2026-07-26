-- Migration: Token usage telemetry (JSONB) + metrics aggregation table
-- Created: 2026-07-24
--
-- Adds a flexible JSONB column to node_executions for capturing raw LLM
-- token usage details (prompt_tokens, completion_tokens, model, cost_usd, etc.)
-- and creates a general-purpose metrics table for aggregating run-level
-- and platform-level telemetry events.

-- ============================================================================
-- 1. Add token_usage JSONB column to node_executions
-- ============================================================================

ALTER TABLE public.node_executions
  ADD COLUMN IF NOT EXISTS token_usage JSONB DEFAULT '{}';

-- ============================================================================
-- 2. Create metrics table for aggregated telemetry
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.metrics (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  metric_name TEXT NOT NULL,
  value       NUMERIC NOT NULL DEFAULT 0,
  tags        JSONB DEFAULT '{}'
);

-- Index for fast time-range and metric-name queries
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON public.metrics (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_name_time ON public.metrics (metric_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_tags ON public.metrics USING gin (tags);

-- ============================================================================
-- 3. RPC: Aggregate token usage from node_executions for a program
-- ============================================================================

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
    COALESCE(SUM(ne.estimated_cost_usd), 0) AS total_cost_usd,
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

-- Revoke from public; called via service-role after program access check
REVOKE EXECUTE ON FUNCTION program_token_usage_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION program_token_usage_summary(UUID) TO service_role;
