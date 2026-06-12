-- Opt-in email two-factor authentication (interim until the mobile
-- authenticator ships). A 6-digit code is emailed at sign-in; the server
-- stores only an HMAC of the code.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_2fa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.two_factor_challenges (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash   TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INTEGER     NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_two_factor_challenges_user
  ON public.two_factor_challenges (user_id, created_at DESC);

-- Service-role only: challenges are issued and verified by server routes.
ALTER TABLE public.two_factor_challenges ENABLE ROW LEVEL SECURITY;
