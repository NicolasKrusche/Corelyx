-- Critical-signal flags: a safety net so an agent can never silently discard a
-- message that shows a credible signal of harm (threat to life, violence, self-
-- harm, abuse, poisoning/contamination/tampering, crime in progress, urgent
-- legal/time-critical emergency). Two sources both land here:
--   origin='auto'  — the runtime screened content the agent read and tripped.
--   origin='agent' — the agent explicitly escalated via corelyx.flag_critical.
-- Items surface in the "Flagged for review" inbox until the user keeps/dismisses.

CREATE TABLE IF NOT EXISTS public.agent_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  program_id      UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  run_id          UUID,
  user_id         UUID,
  source_provider TEXT,
  source_ref      TEXT,
  subject         TEXT,
  snippet         TEXT,
  reason          TEXT,
  categories      TEXT[] NOT NULL DEFAULT '{}',
  origin          TEXT NOT NULL DEFAULT 'auto' CHECK (origin IN ('auto', 'agent')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'kept', 'dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID
);

CREATE INDEX IF NOT EXISTS idx_agent_flags_workspace_status
  ON public.agent_flags (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_flags_program
  ON public.agent_flags (program_id);

ALTER TABLE public.agent_flags ENABLE ROW LEVEL SECURITY;

-- Workspace members can read and resolve flags. (The runtime inserts with the
-- service role, which bypasses RLS.)
CREATE POLICY "workspace members read agent_flags"
  ON public.agent_flags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = agent_flags.workspace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace members resolve agent_flags"
  ON public.agent_flags
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = agent_flags.workspace_id AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.agent_flags IS
  'Critical-signal safety flags (auto-screened or agent-escalated) shown in the Flagged-for-review inbox.';
