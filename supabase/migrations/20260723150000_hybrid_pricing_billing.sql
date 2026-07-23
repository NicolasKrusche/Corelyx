-- Hybrid-Pricing: Seat + Execution-Volume billing tables
-- Created: 2026-07-23
--
-- Adds billing_plans, org_subscriptions, usage_records tables and
-- links orgs to their subscription. RLS policies let org members
-- read their own subscription and usage data.

-- ============================================================================
-- Billing Plans
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing_plans (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL UNIQUE,
  slug                        TEXT NOT NULL UNIQUE,
  seat_price_monthly          NUMERIC(10,2) NOT NULL DEFAULT 0,
  included_seats              INTEGER NOT NULL DEFAULT 1,
  execution_price_per_minute  NUMERIC(10,4) NOT NULL DEFAULT 0,
  included_execution_minutes  INTEGER NOT NULL DEFAULT 0,
  byok_platform_fee_monthly   NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_price_id             TEXT,
  stripe_byok_price_id        TEXT,
  features                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order                  INTEGER NOT NULL DEFAULT 0,
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE billing_plans IS 'Plans that orgs can subscribe to via Stripe';
COMMENT ON COLUMN billing_plans.seat_price_monthly IS 'EUR/month per seat above included_seats';
COMMENT ON COLUMN billing_plans.execution_price_per_minute IS 'EUR per minute of execution above included';
COMMENT ON COLUMN billing_plans.byok_platform_fee_monthly IS 'Flat monthly fee for BYOK (Bring Your Own Key) users';
COMMENT ON COLUMN billing_plans.stripe_price_id IS 'Stripe Price ID for managed billing';
COMMENT ON COLUMN billing_plans.stripe_byok_price_id IS 'Stripe Price ID for BYOK billing';

-- ============================================================================
-- Org Subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_subscriptions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id                     UUID NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
  billing_mode                TEXT NOT NULL DEFAULT 'managed' CHECK (billing_mode IN ('managed', 'byok')),
  stripe_subscription_id      TEXT UNIQUE,
  stripe_customer_id          TEXT,
  status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused')),
  current_period_start        TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end          TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  seats_count                 INTEGER NOT NULL DEFAULT 1,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE org_subscriptions IS 'Active subscription for each organization';
COMMENT ON COLUMN org_subscriptions.billing_mode IS 'managed (platform keys) or byok (user keys + platform fee)';

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_subscriptions_active
  ON org_subscriptions (org_id)
  WHERE status IN ('active', 'trialing');

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org_id
  ON org_subscriptions (org_id);

-- ============================================================================
-- Usage Records
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id              UUID REFERENCES runs(id) ON DELETE SET NULL,
  execution_minutes   NUMERIC(10,4) NOT NULL DEFAULT 0,
  tokens_used         INTEGER NOT NULL DEFAULT 0,
  model               TEXT,
  billing             TEXT NOT NULL DEFAULT 'platform' CHECK (billing IN ('platform', 'byok')),
  estimated_cost_usd  NUMERIC(10,6) NOT NULL DEFAULT 0,
  billed_amount       NUMERIC(10,6) NOT NULL DEFAULT 0,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE usage_records IS 'Per-run usage records for billing aggregation';
COMMENT ON COLUMN usage_records.execution_minutes IS 'Wall-clock execution time in minutes for this run';
COMMENT ON COLUMN usage_records.billing IS 'platform = charged to org via managed plan; byok = user pays own LLM costs';

CREATE INDEX IF NOT EXISTS idx_usage_records_org_recorded
  ON usage_records (org_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_records_org_model
  ON usage_records (org_id, model, recorded_at DESC);

-- ============================================================================
-- Add subscription_id to organizations
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES org_subscriptions(id) ON DELETE SET NULL;

-- ============================================================================
-- Auto-update updated_at trigger for org_subscriptions
-- ============================================================================

CREATE OR REPLACE FUNCTION org_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS org_subscriptions_updated_at ON org_subscriptions;
CREATE TRIGGER org_subscriptions_updated_at
  BEFORE UPDATE ON org_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION org_subscriptions_updated_at();

-- ============================================================================
-- Row-Level Security
-- ============================================================================

ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- billing_plans: everyone can read active plans (public pricing page)
CREATE POLICY "public read active plans"
  ON billing_plans FOR SELECT
  USING (is_active = true);

-- org_subscriptions: org members can read their org's subscription
CREATE POLICY "org members read subscriptions"
  ON org_subscriptions FOR SELECT
  USING (public.is_org_member(org_id));

-- org_subscriptions: org managers can update their subscription
CREATE POLICY "org managers update subscriptions"
  ON org_subscriptions FOR UPDATE
  USING (public.can_manage_org(org_id))
  WITH CHECK (public.can_manage_org(org_id));

-- org_subscriptions: only service_role can insert/delete (via API routes)
CREATE POLICY "service role manages subscriptions"
  ON org_subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);

-- usage_records: org members can read their org's usage
CREATE POLICY "org members read usage"
  ON usage_records FOR SELECT
  USING (public.is_org_member(org_id));

-- usage_records: only service_role can insert (via runtime)
CREATE POLICY "service role insert usage"
  ON usage_records FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- Seed default billing plans
-- ============================================================================

INSERT INTO billing_plans (name, slug, seat_price_monthly, included_seats, execution_price_per_minute, included_execution_minutes, byok_platform_fee_monthly, sort_order, features) VALUES
  ('Free', 'free', 0, 1, 0, 60, 0, 0, '["1 user", "60 execution minutes/mo", "100K tokens", "Community support", "Platform models only"]'),
  ('Solo', 'solo', 0, 1, 0.10, 300, 9.90, 1, '["1 user", "300 execution minutes/mo", "1M tokens", "Priority support", "BYOK option", "Advanced connectors"]'),
  ('Team', 'team', 0, 3, 0.08, 1000, 19.90, 2, '["Up to 5 users", "1,000 execution minutes/mo", "5M tokens", "Priority support", "BYOK option", "Team collaboration", "Custom triggers"]'),
  ('Scale', 'scale', 0, 10, 0.05, 5000, 49.90, 3, '["Up to 25 users", "5,000 execution minutes/mo", "Unlimited tokens", "Dedicated support", "BYOK option", "Priority execution", "SSO", "Audit logs"]')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- Helper: Get or create default free subscription for an org
-- ============================================================================

CREATE OR REPLACE FUNCTION ensure_org_subscription(p_org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id UUID;
  v_free_plan_id UUID;
BEGIN
  -- Check for existing active subscription
  SELECT id INTO v_sub_id
  FROM org_subscriptions
  WHERE org_id = p_org_id AND status IN ('active', 'trialing')
  LIMIT 1;

  IF v_sub_id IS NOT NULL THEN
    RETURN v_sub_id;
  END IF;

  -- Get the free plan
  SELECT id INTO v_free_plan_id
  FROM billing_plans
  WHERE slug = 'free' AND is_active = true
  LIMIT 1;

  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'Free billing plan not found';
  END IF;

  -- Create a free subscription
  INSERT INTO org_subscriptions (org_id, plan_id, billing_mode, status, seats_count)
  VALUES (p_org_id, v_free_plan_id, 'managed', 'active', 1)
  RETURNING id INTO v_sub_id;

  -- Link to org
  UPDATE organizations SET subscription_id = v_sub_id WHERE id = p_org_id;

  RETURN v_sub_id;
END;
$$;
