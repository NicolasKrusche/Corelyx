-- Persistent replay guard for provider webhooks.
-- Used for delivery/message identifiers that must be accepted only once.

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  source        TEXT NOT NULL CHECK (length(source) > 0),
  delivery_id   TEXT NOT NULL CHECK (length(delivery_id) > 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (source, delivery_id)
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_expires_at_idx
  ON public.webhook_deliveries (expires_at);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Webhook replay records are server-maintained only.
-- The Next.js server uses the service role client, which bypasses RLS.
REVOKE ALL ON TABLE public.webhook_deliveries FROM anon, authenticated;
