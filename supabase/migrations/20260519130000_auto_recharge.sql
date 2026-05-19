-- Auto-recharge configuration per user.
-- Stores the threshold below which a top-up is triggered and the amount to top up.
-- last_triggered_at prevents firing more than once per 24 h.

CREATE TABLE IF NOT EXISTS auto_recharge_configs (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled           BOOLEAN NOT NULL DEFAULT false,
  threshold_usd        NUMERIC(10,4) NOT NULL DEFAULT 2.0000,
  recharge_amount_usd  NUMERIC(10,4) NOT NULL DEFAULT 10.0000,
  last_triggered_at    TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE auto_recharge_configs ENABLE ROW LEVEL SECURITY;

-- Users can read and write only their own row.
CREATE POLICY "arc_select_own" ON auto_recharge_configs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "arc_upsert_own" ON auto_recharge_configs
  FOR ALL USING (auth.uid() = user_id);

-- stripe_payment_method_id on profiles: stored after the first successful checkout
-- so auto-recharge can charge without another redirect.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;
