-- One-time server-side latch for OAuth callback state.
-- OAuth state is also HMAC signed and browser-cookie bound in the app layer;
-- this table prevents replay by allowing each issued flow nonce to be consumed once.

CREATE TABLE IF NOT EXISTS public.oauth_state_nonces (
  flow_id     UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nonce_hash  TEXT NOT NULL,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS oauth_state_nonces_pending_idx
  ON public.oauth_state_nonces (user_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS oauth_state_nonces_expires_at_idx
  ON public.oauth_state_nonces (expires_at);

ALTER TABLE public.oauth_state_nonces ENABLE ROW LEVEL SECURITY;

-- No browser/API role should read or mutate OAuth state nonces directly.
-- The Next.js server uses the service role client, which bypasses RLS.
REVOKE ALL ON TABLE public.oauth_state_nonces FROM anon, authenticated;
