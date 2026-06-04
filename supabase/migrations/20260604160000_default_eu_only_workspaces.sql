-- Migration: default NEW workspaces to EU-only compliance mode.
--
-- Privacy-first default: workspaces created from now on default to 'eu_only',
-- which makes the runtime block providers with unresolved EU transfer risk
-- (notably the platform OpenRouter key, which has no countersigned DPA) before a
-- run executes. Existing workspaces keep their current compliance_mode and are
-- NOT changed by this migration.
--
-- CONSEQUENCE: in eu_only mode, running an agent node on the Corelyx *platform*
-- model key (OpenRouter) is blocked at execution time. Users must either bring
-- their own EU-eligible model key (e.g. EU-hosted Mistral, an EU OpenAI project)
-- or switch the workspace to 'standard'. Genesis (workflow generation) is not
-- blocked. Adjust later if/when an OpenRouter DPA + EU routing is in place, or an
-- EU platform model is offered by default.

ALTER TABLE public.workspaces
  ALTER COLUMN compliance_mode SET DEFAULT 'eu_only';
