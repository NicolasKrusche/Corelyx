-- Allow workspace owners to acknowledge DPA compliance for specific providers.
-- Once acknowledged, the compliance check downgrades from "blocked" to "warning"
-- so runs are no longer blocked by that provider's missing registry entry.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS dpa_acknowledged_providers TEXT[] NOT NULL DEFAULT '{}';
