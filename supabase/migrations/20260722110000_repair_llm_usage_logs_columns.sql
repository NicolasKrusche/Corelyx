-- 2026-07-22 — schema repair: restore llm_usage_logs.run_id and .workspace_id.
--
-- Both columns are part of the table's original definition in
-- 20260111120000_launch_readiness.sql, but the live table does not have them.
-- Same class of drift as 20260714120000_repair_cron_schema_drift.sql: the
-- migration file and the database disagree, and the file is right.
--
-- Two consequences, both confirmed against the live database:
--
-- 1. LLM cost logging has never recorded anything. Both writers put these
--    columns in their *base* row — apps/web/lib/llm-usage-log.ts (`baseRow`)
--    and apps/runtime/engine/executor.py (`base_row`) — and both have a
--    fallback that only retries when the failing column is one of the billing
--    columns added by 20260708120000 (source / billing / billed_credits /
--    node_id). A missing run_id or workspace_id is not in that set, so the
--    insert is logged as a warning and the row is dropped. `llm_usage_logs`
--    currently holds 0 rows, so every Genesis and workflow LLM call ever made
--    is unrecorded, and the admin cost/finance pages have nothing to read.
--
-- 2. 20260722120000_program_analytics.sql cannot be created. Its
--    program_analytics_by_model function does
--    `JOIN runs r ON r.id = l.run_id`, and LANGUAGE sql bodies are validated at
--    CREATE time, so it fails with "column l.run_id does not exist". This
--    migration must therefore run before it — hence the 20260722110000 stamp.
--
-- Historical rows are unaffected because there are none. Both columns are
-- nullable with ON DELETE SET NULL, matching the original definition: a usage
-- row outlives the run it came from.

ALTER TABLE public.llm_usage_logs
  ADD COLUMN IF NOT EXISTS run_id       UUID REFERENCES public.runs(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.llm_usage_logs.run_id IS
  'Run that produced this call; NULL for calls outside a run (e.g. Genesis).';
COMMENT ON COLUMN public.llm_usage_logs.workspace_id IS
  'Workspace the call is attributed to; NULL when not workspace-scoped.';

-- Indexes from the original definition, which never got created either.
CREATE INDEX IF NOT EXISTS idx_llm_usage_run
  ON public.llm_usage_logs (run_id)
  WHERE run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_usage_workspace_created
  ON public.llm_usage_logs (workspace_id, created_at)
  WHERE workspace_id IS NOT NULL;
