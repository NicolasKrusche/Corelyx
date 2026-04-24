-- Server-only references to provider webhook secrets stored in Supabase Vault.
-- Keeps hook/signing secrets out of client-visible connection metadata.

CREATE TABLE IF NOT EXISTS public.connection_webhook_secrets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (length(provider) > 0),
  secret_name     TEXT NOT NULL CHECK (length(secret_name) > 0),
  vault_secret_id UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, provider, secret_name)
);

CREATE INDEX IF NOT EXISTS connection_webhook_secrets_connection_idx
  ON public.connection_webhook_secrets (connection_id);

ALTER TABLE public.connection_webhook_secrets ENABLE ROW LEVEL SECURITY;

-- Webhook secret references are server-maintained only.
-- The Next.js server uses the service role client, which bypasses RLS.
REVOKE ALL ON TABLE public.connection_webhook_secrets FROM anon, authenticated;
