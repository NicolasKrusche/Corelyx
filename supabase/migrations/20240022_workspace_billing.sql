-- Workspace-scoped billing and usage.
-- Profiles keep legacy fields for compatibility, but limits now read from the
-- active/program workspace.

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

UPDATE public.workspaces w
SET tier = COALESCE(p.tier, w.tier),
    plan_expires_at = COALESCE(p.plan_expires_at, w.plan_expires_at),
    bonus_runs = COALESCE(p.bonus_runs, w.bonus_runs),
    is_beta_tester = COALESCE(p.is_beta_tester, w.is_beta_tester),
    genesis_uses_this_month = COALESCE(p.genesis_uses_this_month, w.genesis_uses_this_month),
    genesis_month_reset_at = COALESCE(p.genesis_month_reset_at, w.genesis_month_reset_at)
FROM public.profiles p
WHERE p.id = w.created_by;
