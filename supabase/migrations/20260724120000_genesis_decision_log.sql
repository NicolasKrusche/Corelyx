-- Genesis Explainability Layer — persist the per-node decision log ("why did
-- Genesis build it this way?") captured at generation/refinement time. Powers
-- the "Why this workflow?" reasoning tree and the EU AI Act Art. 14 / Art. 50
-- compliance audit export.
--
-- Nullable: older programs and non-Genesis programs simply have no stored log;
-- the app falls back to deriving a deterministic log from the schema on demand.

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS decision_log JSONB;

COMMENT ON COLUMN public.programs.decision_log IS
  'Genesis decision log: per-node reasoning, alternatives considered, and confidence scores. Shape: { version, generated_at, model, summary, entries[] }. See apps/web/lib/genesis/decision-log.ts.';
