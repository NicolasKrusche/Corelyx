-- Add last_used_at timestamp to api_keys.
-- Stamped by the internal vault endpoint whenever a key is fetched by the runtime.
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- Index for quick "recently used" queries (admin visibility, future analytics).
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used_at
  ON public.api_keys (last_used_at DESC NULLS LAST);
