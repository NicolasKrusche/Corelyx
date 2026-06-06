-- Agent reports.
--
-- A distinguishing capability of agents (vs. fire-and-forget workflows): an
-- agent can relay structured findings back to the user via the
-- `corelyx.report_to_user` tool. Each call appends a report tied to the run, and
-- the agent detail page surfaces them in a dedicated "Report" window.
--
-- Reports are read-safe (no account mutation), so they are produced in dry runs
-- too — letting the user preview what an agent would tell them before approving.

CREATE TABLE IF NOT EXISTS public.agent_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  program_id   UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT 'Report',
  body         TEXT NOT NULL DEFAULT '',
  -- Optional structured payload (e.g. tables/findings) the UI may render.
  data         JSONB,
  -- True when produced during a dry run (so the UI can label it a preview).
  dry_run      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The detail page lists reports for a run, newest first.
CREATE INDEX IF NOT EXISTS idx_agent_reports_run
  ON public.agent_reports (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_reports_program
  ON public.agent_reports (program_id, created_at);

ALTER TABLE public.agent_reports ENABLE ROW LEVEL SECURITY;

-- Owners (via the program) may read their agent's reports. Writes happen through
-- the service-role client in the internal agent-tools path.
CREATE POLICY "own agent_reports" ON public.agent_reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_id AND p.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.agent_reports IS
  'Structured findings an agent relays to the user via corelyx.report_to_user, tied to a run.';
