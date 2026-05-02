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

CREATE INDEX IF NOT EXISTS idx_llm_usage_user_created 
ON llm_usage_logs(user_id, created_at);

-- ============================================================================
-- Admin Role
-- ============================================================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- To make yourself admin, run this separately after knowing your user ID:
-- UPDATE profiles SET is_admin = TRUE WHERE id = 'your-user-id-here';
-- Or use the Supabase UI to edit your profile row
