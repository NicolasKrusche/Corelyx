-- Migration: resolve the analytics node type from the program schema
-- Created: 2026-08-05
--
-- program_cost_by_node_type and program_token_usage_summary derived a node's
-- type with:
--
--     COALESCE(ne.output_payload->>'type', ne.input_payload->>'_node_type', 'unknown')
--
-- Both fallbacks are wrong:
--   * output_payload->>'type' reads a key out of the node's OUTPUT. Node
--     outputs routinely carry a JSON-Schema-shaped blob whose "type" is
--     "object", so essentially every execution bucketed into a single row
--     labelled "object" on the per-program analytics page.
--   * _node_type is never written — nothing in apps/runtime sets that key on
--     input_payload — so the second branch could never fire.
--
-- The authoritative source is the program schema itself: programs.schema is
-- the canonical workflow document and each entry in its `nodes` array carries
-- {id, type, ...}. Matching node_executions.node_id against it fixes historical
-- rows too, with no runtime redeploy. Nodes since deleted from the schema no
-- longer resolve, so _node_type is kept as a second chance in case the runtime
-- ever starts stamping it, and 'unknown' remains the floor.
--
-- Function bodies are otherwise unchanged from 20260802130000.

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
      nt.node_type,
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
  JOIN programs p ON p.id = r.program_id
  LEFT JOIN LATERAL (
    SELECT n->>'type' AS node_type
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p.schema->'nodes') = 'array' THEN p.schema->'nodes'
        ELSE '[]'::jsonb
      END
    ) AS n
    WHERE n->>'id' = ne.node_id
    LIMIT 1
  ) nt ON TRUE
  WHERE r.program_id = p_program_id
    AND ne.status IN ('completed', 'failed')
  GROUP BY 1
  ORDER BY total_cost_usd DESC;
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
      nt.node_type,
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
  JOIN programs p ON p.id = r.program_id
  LEFT JOIN LATERAL (
    SELECT n->>'type' AS node_type
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p.schema->'nodes') = 'array' THEN p.schema->'nodes'
        ELSE '[]'::jsonb
      END
    ) AS n
    WHERE n->>'id' = ne.node_id
    LIMIT 1
  ) nt ON TRUE
  WHERE r.program_id = p_program_id
    AND ne.status IN ('completed', 'failed')
    AND ne.token_usage != '{}'::jsonb
  GROUP BY 1
  ORDER BY total_cost_usd DESC;
$$;

-- Re-assert grants: CREATE OR REPLACE preserves ACLs, but keep this explicit
-- so a from-scratch apply matches the original migrations.
REVOKE EXECUTE ON FUNCTION program_cost_by_node_type(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION program_token_usage_summary(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION program_cost_by_node_type(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION program_token_usage_summary(UUID) TO service_role;
