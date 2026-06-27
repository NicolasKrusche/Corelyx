-- Agent relations: real agent-to-agent (and agent-to-source) reference edges,
-- so the Agents "Flow" view can draw the four relationship types from live data
-- instead of an illustrative example.
--
--   spawns       — a parent agent spawned a child agent (child lands as a draft
--                  in the parent's workspace, awaiting the user's review/approval).
--   cross_check  — an agent referenced a peer agent (corelyx.reference_agent).
--   feeds        — one agent's report fed another (corelyx.read_agent_report) —
--                  also the shape lineage re-runs already imply.
--   reads_source — an agent read a source: a knowledge doc or a connected app.
--
-- Exactly one target reference is set per row, selected by target_kind:
--   agent     → target_program_id
--   knowledge → target_knowledge_id
--   connector → target_label (the connection name/provider — no FK)

CREATE TABLE IF NOT EXISTS public.agent_relations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  from_program_id     UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  rel_type            TEXT NOT NULL CHECK (rel_type IN ('spawns', 'cross_check', 'feeds', 'reads_source')),
  target_kind         TEXT NOT NULL CHECK (target_kind IN ('agent', 'knowledge', 'connector')),
  target_program_id   UUID REFERENCES public.programs(id) ON DELETE CASCADE,
  target_knowledge_id UUID REFERENCES public.agent_knowledge(id) ON DELETE CASCADE,
  target_label        TEXT,
  label               TEXT,
  run_id              UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (target_kind = 'agent'     AND target_program_id   IS NOT NULL) OR
    (target_kind = 'knowledge' AND target_knowledge_id IS NOT NULL) OR
    (target_kind = 'connector' AND target_label        IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_relations_workspace
  ON public.agent_relations (workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_relations_from
  ON public.agent_relations (from_program_id);
CREATE INDEX IF NOT EXISTS idx_agent_relations_target_program
  ON public.agent_relations (target_program_id);

-- De-dupe identical edges (one row per from→target per rel_type), per target kind.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_relation_agent
  ON public.agent_relations (from_program_id, target_program_id, rel_type)
  WHERE target_kind = 'agent';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_relation_knowledge
  ON public.agent_relations (from_program_id, target_knowledge_id, rel_type)
  WHERE target_kind = 'knowledge';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_relation_connector
  ON public.agent_relations (from_program_id, target_label, rel_type)
  WHERE target_kind = 'connector';

ALTER TABLE public.agent_relations ENABLE ROW LEVEL SECURITY;

-- Same access model as agents/knowledge: any member of the owning workspace.
-- (The runtime tool layer writes with the service role, which bypasses RLS.)
CREATE POLICY "workspace members read agent_relations"
  ON public.agent_relations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = agent_relations.workspace_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.agent_relations IS
  'Live agent reference edges (spawns / cross_check / feeds / reads_source) drawn on the Agents Flow view.';
