-- Connector tier enforcement: mark connections disabled instead of deleting them.
--
-- Context: entitlement checks on connectors used to run only at connect time, so
-- a downgrade left working credentials behind forever. Enforcement now also runs
-- at the execution boundary (/api/internal/connections/[id]/token), and the
-- billing webhook flags affected rows on downgrade.
--
-- Deliberately a separate column from `is_valid`: that one means "the credential
-- itself is broken/expired" and drives reconnect prompts and health checks.
-- Conflating an entitlement decision with a broken credential would tell the
-- user to re-authenticate a connection that is working fine, and would make the
-- health checker fight the billing webhook over the same field.
--
-- Nullable, no default: NULL = active. Reconnecting or upgrading clears it.

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS disabled_reason text;

COMMENT ON COLUMN public.connections.disabled_reason IS
  'NULL = active. Non-null = withheld at execution time; value is the machine-readable cause (e.g. ''tier_downgrade''). Distinct from is_valid, which tracks credential health.';

-- Only ever a handful of rows are disabled, and every token fetch filters on it.
CREATE INDEX IF NOT EXISTS connections_disabled_reason_idx
  ON public.connections (workspace_id)
  WHERE disabled_reason IS NOT NULL;
