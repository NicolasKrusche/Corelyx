-- Per-workspace PII pseudonymization tier for LLM-bound content.
--   auto     → strict person-name pseudonymization when the workspace is eu_only
--              (structured identifiers are always pseudonymized regardless).
--   standard → structured identifiers only.
--   strict   → structured identifiers + local-NER person names.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS pii_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (pii_mode IN ('auto', 'standard', 'strict'));
