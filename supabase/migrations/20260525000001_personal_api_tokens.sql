-- Personal API tokens for programmatic access to the Corelyx platform API.
-- Tokens are prefixed `crlx_` and only the SHA-256 hash is stored — the
-- plaintext is shown to the user once at creation and never retrievable again.

CREATE TABLE IF NOT EXISTS public.personal_api_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  token_prefix  TEXT        NOT NULL,   -- e.g. "crlx_ab12cd..." — safe to display
  token_hash    TEXT        NOT NULL UNIQUE, -- SHA-256 hex of the full token
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.personal_api_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read, create, and delete their own tokens.
CREATE POLICY "users manage own tokens"
  ON public.personal_api_tokens
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Helpful index for the middleware token lookup (hash-based).
CREATE INDEX IF NOT EXISTS personal_api_tokens_hash_idx
  ON public.personal_api_tokens (token_hash);

-- Index for per-user listing.
CREATE INDEX IF NOT EXISTS personal_api_tokens_user_idx
  ON public.personal_api_tokens (user_id);
