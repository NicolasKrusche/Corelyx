-- Migration: onboarding profiles (personalized onboarding + agent context).
--
-- Stores the answers from the extended signup onboarding wizard. Two classes of
-- data with different legal bases (GDPR):
--
--   1. Categorical metadata (account_type, team_size bracket, industry/role/goal
--      /tool keys from fixed catalogs) — processed under legitimate interest
--      (Art. 6(1)(f)) to configure the product. Never free text, so it cannot
--      carry personal data beyond the account link itself.
--   2. Free-text answers (current_processes, automation_wishes) and the derived
--      ai_context summary — processed ONLY with explicit consent
--      (Art. 6(1)(a), profile_consent = true). Without consent these columns
--      must stay NULL; the CHECK constraint enforces that at the database level.
--
-- ai_context is the internal background summary injected into Genesis prompts
-- and agent runs so AI features know the user's industry, tools, and goals.
-- It is never shown in the UI but is included in the GDPR data export
-- (/api/user/export) for transparency. Consent is revocable: clearing
-- profile_consent must also clear the free-text and ai_context columns.

CREATE TABLE IF NOT EXISTS public.onboarding_profiles (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type      TEXT CHECK (account_type IN ('personal', 'startup', 'business', 'agency')),
  team_size         TEXT CHECK (team_size IN ('solo', '2_10', '11_50', '51_200', '200_plus')),
  industry          TEXT,
  role              TEXT,
  goals             TEXT[] NOT NULL DEFAULT '{}',
  tools             TEXT[] NOT NULL DEFAULT '{}',
  current_processes TEXT,
  automation_wishes TEXT,
  profile_consent   BOOLEAN NOT NULL DEFAULT FALSE,
  consent_at        TIMESTAMPTZ,
  ai_context        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Defense in depth: free text and the derived AI summary only exist with consent.
  CONSTRAINT onboarding_free_text_requires_consent CHECK (
    profile_consent
    OR (current_processes IS NULL AND automation_wishes IS NULL AND ai_context IS NULL)
  )
);

ALTER TABLE public.onboarding_profiles ENABLE ROW LEVEL SECURITY;

-- Users manage only their own row. AI features read it via the service-role
-- client in server-only code paths.
CREATE POLICY "users manage own onboarding profile" ON public.onboarding_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.onboarding_profiles IS
  'Signup onboarding answers. Categorical keys under legitimate interest; free text + ai_context only with explicit consent (profile_consent).';
COMMENT ON COLUMN public.onboarding_profiles.ai_context IS
  'Internal background summary for Genesis/agent prompts. Consent-gated; never rendered in the UI.';
