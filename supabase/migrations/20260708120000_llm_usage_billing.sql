-- Migration: LLM usage billing columns + admin finance aggregations
-- Created: 2026-07-08
--
-- The runtime now writes one llm_usage_logs row per LLM call (workflow + agent
-- paths). estimated_cost_usd stays RAW provider cost in USD; the new columns
-- record who funded the call and what the user was charged, so the admin
-- finances page can compute profit (billed credits value minus platform cost).

-- ============================================================================
-- Billing attribution columns
-- ============================================================================

ALTER TABLE llm_usage_logs
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'workflow',
ADD COLUMN IF NOT EXISTS billing TEXT NOT NULL DEFAULT 'platform',
ADD COLUMN IF NOT EXISTS billed_credits INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS node_id TEXT;

COMMENT ON COLUMN llm_usage_logs.source IS 'What produced the call: workflow | agent';
COMMENT ON COLUMN llm_usage_logs.billing IS 'Who funds the provider cost: platform (our key) | byok (user''s own key)';
COMMENT ON COLUMN llm_usage_logs.billed_credits IS 'Credits charged to the user for this call (1000 credits = $1); 0 for byok/free';

-- Time-window scans for the admin cost/finance pages.
CREATE INDEX IF NOT EXISTS idx_llm_usage_created_at
ON llm_usage_logs(created_at);

-- ============================================================================
-- Admin finance aggregations (called with the service-role client only)
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_llm_finance_summary(since TIMESTAMPTZ)
RETURNS TABLE (
    call_count BIGINT,
    distinct_users BIGINT,
    total_tokens BIGINT,
    provider_cost_usd NUMERIC,
    platform_cost_usd NUMERIC,
    byok_cost_usd NUMERIC,
    billed_credits BIGINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT
        COUNT(*),
        COUNT(DISTINCT l.user_id),
        COALESCE(SUM(l.total_tokens), 0)::BIGINT,
        COALESCE(SUM(l.estimated_cost_usd), 0),
        COALESCE(SUM(l.estimated_cost_usd) FILTER (WHERE l.billing = 'platform'), 0),
        COALESCE(SUM(l.estimated_cost_usd) FILTER (WHERE l.billing <> 'platform'), 0),
        COALESCE(SUM(l.billed_credits), 0)::BIGINT
    FROM llm_usage_logs l
    WHERE l.created_at >= since;
$$;

CREATE OR REPLACE FUNCTION admin_llm_model_spread(since TIMESTAMPTZ)
RETURNS TABLE (
    model TEXT,
    call_count BIGINT,
    total_tokens BIGINT,
    provider_cost_usd NUMERIC,
    platform_cost_usd NUMERIC,
    billed_credits BIGINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT
        l.model,
        COUNT(*),
        COALESCE(SUM(l.total_tokens), 0)::BIGINT,
        COALESCE(SUM(l.estimated_cost_usd), 0),
        COALESCE(SUM(l.estimated_cost_usd) FILTER (WHERE l.billing = 'platform'), 0),
        COALESCE(SUM(l.billed_credits), 0)::BIGINT
    FROM llm_usage_logs l
    WHERE l.created_at >= since
    GROUP BY l.model
    ORDER BY 4 DESC;
$$;

CREATE OR REPLACE FUNCTION admin_llm_top_users(since TIMESTAMPTZ, max_rows INT DEFAULT 10)
RETURNS TABLE (
    user_id UUID,
    call_count BIGINT,
    total_tokens BIGINT,
    provider_cost_usd NUMERIC,
    billed_credits BIGINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT
        l.user_id,
        COUNT(*),
        COALESCE(SUM(l.total_tokens), 0)::BIGINT,
        COALESCE(SUM(l.estimated_cost_usd), 0),
        COALESCE(SUM(l.billed_credits), 0)::BIGINT
    FROM llm_usage_logs l
    WHERE l.created_at >= since
    GROUP BY l.user_id
    ORDER BY 4 DESC
    LIMIT max_rows;
$$;

CREATE OR REPLACE FUNCTION admin_llm_daily_series(since TIMESTAMPTZ)
RETURNS TABLE (
    day DATE,
    call_count BIGINT,
    provider_cost_usd NUMERIC,
    platform_cost_usd NUMERIC,
    billed_credits BIGINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT
        DATE(l.created_at),
        COUNT(*),
        COALESCE(SUM(l.estimated_cost_usd), 0),
        COALESCE(SUM(l.estimated_cost_usd) FILTER (WHERE l.billing = 'platform'), 0),
        COALESCE(SUM(l.billed_credits), 0)::BIGINT
    FROM llm_usage_logs l
    WHERE l.created_at >= since
    GROUP BY DATE(l.created_at)
    ORDER BY 1;
$$;

-- Finance data is admin-only: never callable from browser roles. The web app
-- invokes these through the service-role client after its own admin checks.
REVOKE EXECUTE ON FUNCTION admin_llm_finance_summary(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_llm_model_spread(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_llm_top_users(TIMESTAMPTZ, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_llm_daily_series(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_llm_finance_summary(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION admin_llm_model_spread(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION admin_llm_top_users(TIMESTAMPTZ, INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_llm_daily_series(TIMESTAMPTZ) TO service_role;
