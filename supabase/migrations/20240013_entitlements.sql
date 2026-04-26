-- FlowOS — Entitlements: fix 'plus' tier + genesis tracking + plus redemption types

-- ─── PROFILES: add 'plus' to tier constraint ──────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_tier_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tier_check
    CHECK (tier IN ('free', 'plus', 'pro', 'builder', 'unlimited'));

-- ─── PROFILES: genesis usage tracking ────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS genesis_uses_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS genesis_month_reset_at  TIMESTAMPTZ;

-- ─── REDEMPTION CODES: add 'plus' types ──────────────────────────────────────
ALTER TABLE public.redemption_codes
  DROP CONSTRAINT IF EXISTS redemption_codes_type_check;

ALTER TABLE public.redemption_codes
  ADD CONSTRAINT redemption_codes_type_check
    CHECK (type IN (
      'plus_lifetime',
      'plus_trial',
      'pro_lifetime',
      'builder_lifetime',
      'unlimited',
      'pro_trial',
      'run_credits'
    ));
