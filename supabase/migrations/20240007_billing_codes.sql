-- FlowOS — Billing tiers + redemption codes

-- ─── PROFILES: extend for billing ─────────────────────────────────────────────

-- Drop old tier constraint and replace with full tier set
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_tier_check;

ALTER TABLE public.profiles
  ALTER COLUMN tier SET DEFAULT 'free',
  ADD CONSTRAINT profiles_tier_check
    CHECK (tier IN ('free', 'pro', 'builder', 'unlimited'));

-- Update any legacy 'enterprise' rows to 'builder'
UPDATE public.profiles SET tier = 'builder' WHERE tier = 'enterprise';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bonus_runs       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_beta_tester   BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── REDEMPTION CODES ─────────────────────────────────────────────────────────

CREATE TABLE public.redemption_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  label         TEXT,                         -- human-readable name, e.g. "AppSumo LTD"
  type          TEXT NOT NULL CHECK (type IN (
                  'pro_lifetime',
                  'builder_lifetime',
                  'unlimited',
                  'pro_trial',
                  'run_credits'
                )),
  value         JSONB,                         -- { "days": 90 } or { "runs": 500 }
  locked_to_email TEXT,                        -- if set, only this email can redeem
  max_uses      INTEGER,                       -- null = unlimited
  uses_count    INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ,                   -- when the code stops being redeemable
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_redemption_codes_code ON public.redemption_codes (code);
CREATE INDEX idx_redemption_codes_active ON public.redemption_codes (is_active, expires_at);

-- ─── REDEMPTIONS ──────────────────────────────────────────────────────────────

CREATE TABLE public.redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id     UUID NOT NULL REFERENCES public.redemption_codes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (code_id, user_id)                   -- one redemption per user per code
);

CREATE INDEX idx_redemptions_user ON public.redemptions (user_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

-- Users cannot read codes table (codes are admin-only)
-- Redemption is handled server-side via service role — no client RLS needed

-- Users can read their own redemptions
CREATE POLICY "Users read own redemptions"
  ON public.redemptions FOR SELECT
  USING (auth.uid() = user_id);
