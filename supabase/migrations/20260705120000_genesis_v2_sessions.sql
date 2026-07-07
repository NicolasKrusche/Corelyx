-- Genesis V2: patch-based refinement + clarifying-question sessions.
--
-- program_versions.patch — structured diff (GenesisPatchSummary) of what a
-- refinement changed, powering the editor's visual diff. change_summary stays
-- the human-readable line.
--
-- genesis_sessions — a generation that raised clarifying questions persists
-- here so the user can answer later, from another tab or device. Contains the
-- questions and node references only, NEVER credentials. Questions are
-- rehydrated model output (real values, same trust level as the saved program
-- schema itself). Sessions expire after 48h; expired sessions are treated as
-- abandoned and cost the user nothing beyond the original generation.

ALTER TABLE public.program_versions
  ADD COLUMN IF NOT EXISTS patch JSONB;

COMMENT ON COLUMN public.program_versions.patch IS
  'Structured Genesis refinement diff: {added_node_ids, updated_node_ids, removed_node_ids, added_edge_ids, updated_edge_ids, removed_edge_ids, change_summary}.';

CREATE TABLE IF NOT EXISTS public.genesis_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  program_id      UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'awaiting_clarification'
                    CHECK (status IN ('awaiting_clarification', 'completed', 'abandoned')),
  -- [{node_id, question, blocked_node_ids}] — entries are removed as answered.
  clarifications  JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours')
);

CREATE INDEX IF NOT EXISTS idx_genesis_sessions_program
  ON public.genesis_sessions (program_id, status);
CREATE INDEX IF NOT EXISTS idx_genesis_sessions_user
  ON public.genesis_sessions (user_id, status);

ALTER TABLE public.genesis_sessions ENABLE ROW LEVEL SECURITY;

-- The owner reads their sessions; all writes go through the server (service
-- role bypasses RLS), so answers/expiry can't be forged client-side.
CREATE POLICY "owner reads genesis_sessions"
  ON public.genesis_sessions
  FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE public.genesis_sessions IS
  'Genesis V2 clarifying-question sessions: open questions pinned to nodes of a generated program, answered asynchronously.';
