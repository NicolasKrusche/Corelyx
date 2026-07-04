-- Pending migrations not yet applied to your Supabase database (probed 2026-07-04, evening).
-- Run this whole file once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Everything is idempotent, so re-running is safe. Delete this file afterwards.
--
-- The earlier batch (agent_flags, bulk_write_approval_threshold, credential-lock
-- cleanup) is applied and has been removed from this file. What remains fixes:
--
--  1. Silent "free tier for everyone": lib/limits.ts getBillingScope() selects
--     billing columns that do not exist in the live DB, so the whole select
--     fails, the error is discarded, and EVERY user's tier resolves to "free"
--     (2-program cap, 3 Genesis uses/month) unless their email is in the
--     ADMIN_EMAILS env. Real tiers in profiles.tier (e.g. "unlimited") are
--     ignored until these columns exist.
--
--  2. Silent loss of all audit logs: the immutable-logs migration recreated
--     app_logs RLS with SELECT only, so user-scoped writeAppLog() inserts have
--     failed silently since 2026-05-29 (last Genesis log row: May 26). This is
--     why the Genesis outage on www.corelyx.app left no trace in app_logs.

-- ── 20240013_entitlements.sql (missing parts): profiles genesis tracking ─────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS genesis_uses_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS genesis_month_reset_at  TIMESTAMPTZ;

-- ── 20240022_workspace_billing.sql: workspace-scoped billing columns ─────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'plus', 'pro', 'builder', 'unlimited')),
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bonus_runs INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_beta_tester BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS genesis_uses_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS genesis_month_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_workspaces_tier
  ON public.workspaces (tier);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_stripe_customer_id
  ON public.workspaces (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_stripe_subscription_id
  ON public.workspaces (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Backfill workspace billing from the creator's profile so paid tiers
-- (e.g. profiles.tier = 'unlimited') take effect at the workspace level.
UPDATE public.workspaces w
SET tier = COALESCE(p.tier, w.tier),
    plan_expires_at = COALESCE(p.plan_expires_at, w.plan_expires_at),
    bonus_runs = COALESCE(p.bonus_runs, w.bonus_runs),
    is_beta_tester = COALESCE(p.is_beta_tester, w.is_beta_tester),
    genesis_uses_this_month = COALESCE(p.genesis_uses_this_month, w.genesis_uses_this_month),
    genesis_month_reset_at = COALESCE(p.genesis_month_reset_at, w.genesis_month_reset_at)
FROM public.profiles p
WHERE p.id = w.created_by;

-- ── 20260704220000_restore_app_logs_insert_policy.sql ────────────────────────
-- Users may APPEND their own audit rows again; UPDATE/DELETE stay revoked and
-- trigger-guarded by the immutable-logs migration.
DROP POLICY IF EXISTS "users insert own app_logs" ON public.app_logs;
CREATE POLICY "users insert own app_logs" ON public.app_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
