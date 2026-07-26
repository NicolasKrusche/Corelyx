-- Migration: Webhook endpoint configuration for generic inbound webhooks
-- Created: 2026-07-22
--
-- Adds a webhook_endpoints table for configurable inbound webhook routing.
-- Each endpoint maps to a trigger/program and stores HMAC signing configuration.
-- This supports the generic inbound webhook route at /api/webhooks/inbound.

-- ─── WEBHOOK ENDPOINTS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id       UUID NOT NULL REFERENCES public.triggers(id) ON DELETE CASCADE,
  program_id       UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id     UUID,
  name             TEXT NOT NULL DEFAULT 'Webhook',
  signing_secret   TEXT NOT NULL,  -- HMAC-SHA256 signing secret (plaintext, server-only)
  signature_header TEXT DEFAULT 'x-webhook-signature',
  timestamp_header TEXT DEFAULT 'x-webhook-timestamp',
  signature_prefix TEXT DEFAULT '',  -- e.g. 'sha256=' for GitHub-style, 'v1=' for Stripe-style
  allowed_methods  TEXT[] DEFAULT ARRAY['POST']::TEXT[],  -- HTTP methods allowed (POST, PUT, etc.)
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for endpoint lookup by ID
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_id
  ON public.webhook_endpoints (id);

-- Index for program-scoped endpoint listing
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_program
  ON public.webhook_endpoints (program_id)
  WHERE is_active = TRUE;

-- ─── RLS POLICIES ───────────────────────────────────────────────────────────

-- Enable RLS
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- Users can read their own webhook endpoints
CREATE POLICY webhook_endpoints_select_own
  ON public.webhook_endpoints
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert webhook endpoints for their programs
CREATE POLICY webhook_endpoints_insert_own
  ON public.webhook_endpoints
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own webhook endpoints
CREATE POLICY webhook_endpoints_update_own
  ON public.webhook_endpoints
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own webhook endpoints
CREATE POLICY webhook_endpoints_delete_own
  ON public.webhook_endpoints
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access all webhook endpoints (for API route verification)
ALTER TABLE public.webhook_endpoints FORCE ROW LEVEL SECURITY;

-- ─── HELPER: generate signing secret ────────────────────────────────────────

-- Was: SELECT encode(gen_random_bytes(32), 'hex');
--
-- gen_random_bytes() comes from pgcrypto, which Supabase installs into the
-- `extensions` schema — not `public` — so a SECURITY DEFINER function pinned to
-- `SET search_path = public` cannot resolve it and the CREATE fails with
-- "function gen_random_bytes(integer) does not exist". Widening the search_path
-- to include `extensions` would work, but it makes a security-relevant function
-- depend on where an extension happens to be installed.
--
-- gen_random_uuid() needs no extension at all (pg_catalog, PG13+) and is
-- already proven in this database — 47 migrations use it and every live table's
-- id defaults to it. Two v4 UUIDs stripped of dashes give 64 hex characters
-- from the same CSPRNG, i.e. 244 bits of entropy, which is ample for a signing
-- secret and matches the previous output format exactly.
CREATE OR REPLACE FUNCTION public.generate_webhook_signing_secret()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public AS $$
  SELECT replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
$$;

REVOKE EXECUTE ON FUNCTION public.generate_webhook_signing_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_webhook_signing_secret() TO service_role;

-- ─── UPDATED_AT TRIGGER ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_webhook_endpoints_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_webhook_endpoints_updated_at
  BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_webhook_endpoints_timestamp();

-- ─── DOWNSTREAM TRIGGER: auto-create endpoint when webhook trigger added ─────

-- When a webhook trigger is created, automatically generate a signing secret
-- for its webhook_endpoints row (if one doesn't already exist).
CREATE OR REPLACE FUNCTION public.auto_create_webhook_endpoint()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.type = 'webhook' AND NEW.webhook_token IS NOT NULL THEN
    INSERT INTO public.webhook_endpoints (
      trigger_id, program_id, user_id, workspace_id,
      name, signing_secret
    )
    SELECT
      NEW.id,
      NEW.program_id,
      p.user_id,
      p.workspace_id,
      'Webhook Endpoint',
      public.generate_webhook_signing_secret()
    FROM public.programs p
    WHERE p.id = NEW.program_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_create_webhook_endpoint_on_trigger
  AFTER INSERT ON public.triggers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_webhook_endpoint();
