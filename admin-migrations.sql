-- Migration: Launch readiness - credential locks and cost tracking
-- Created: 2026-01-11

-- ============================================================================
-- Credential Locks (for distributed OAuth token refresh)
-- ============================================================================

CREATE TABLE IF NOT EXISTS credential_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lock_key TEXT NOT NULL UNIQUE,
    lock_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_credential_locks_expires 
ON credential_locks(expires_at);

-- Auto-cleanup expired locks function
CREATE OR REPLACE FUNCTION cleanup_expired_credential_locks()
RETURNS void AS $$
BEGIN
    DELETE FROM credential_locks 
    WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- LLM Usage Logs (for cost tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for cost tracking queries
CREATE INDEX IF NOT EXISTS idx_llm_usage_user_created 
ON llm_usage_logs(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_llm_usage_workspace_created 
ON llm_usage_logs(workspace_id, created_at) 
WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_usage_run 
ON llm_usage_logs(run_id) 
WHERE run_id IS NOT NULL;

-- Daily cost aggregation view
CREATE OR REPLACE VIEW daily_llm_costs AS
SELECT 
    user_id,
    DATE(created_at) as date,
    SUM(estimated_cost_usd) as total_cost,
    SUM(total_tokens) as total_tokens,
    COUNT(*) as request_count
FROM llm_usage_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY user_id, DATE(created_at);

-- ============================================================================
-- Run Limits Enforcement (optional - for strict enforcement)
-- ============================================================================

-- Add columns to runs table for limit tracking
ALTER TABLE runs 
ADD COLUMN IF NOT EXISTS node_execution_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS llm_token_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS estimated_cost_usd DECIMAL(10, 6) DEFAULT 0;

-- Index for finding runs approaching limits
CREATE INDEX IF NOT EXISTS idx_runs_cost_tracking 
ON runs(user_id, status, estimated_cost_usd) 
WHERE status = 'running';

-- ============================================================================
-- Health Check Function
-- ============================================================================

CREATE OR REPLACE FUNCTION health_check()
RETURNS BOOLEAN AS $$
BEGIN
    -- Simple connectivity check
    PERFORM 1;
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Row Level Security Policies
-- ============================================================================

-- Credential locks - service role only (no user access needed)
ALTER TABLE credential_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON credential_locks
    FOR ALL
    TO service_role
    USING (true);

-- LLM usage logs - users can only see their own
ALTER TABLE llm_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own usage" ON llm_usage_logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Service role insert" ON llm_usage_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE credential_locks IS 'Distributed locks for OAuth token refresh - prevents race conditions';
COMMENT ON TABLE llm_usage_logs IS 'Audit log for LLM API usage and cost tracking';
COMMENT ON VIEW daily_llm_costs IS 'Daily aggregated LLM costs per user for billing';

-- Function to get daily LLM cost
CREATE OR REPLACE FUNCTION get_daily_llm_cost(target_date DATE)
RETURNS NUMERIC AS $$
DECLARE
  total_cost NUMERIC;
BEGIN
  SELECT COALESCE(SUM(estimated_cost_usd), 0)
  INTO total_cost
  FROM llm_usage_logs
  WHERE DATE(created_at) = target_date;
  
  RETURN total_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Admin Role
-- ============================================================================

-- Add is_admin column to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create index for admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin 
ON profiles(is_admin) 
WHERE is_admin = TRUE;

-- Add comment
COMMENT ON COLUMN profiles.is_admin IS 'Whether user has admin access to system dashboards';

-- Make yourself admin (replace with your email)
UPDATE profiles 
SET is_admin = TRUE 
WHERE email = 'nicolas.krusche.09@gmail.com';
