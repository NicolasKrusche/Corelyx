-- Knowledge canvas: knowledge docs become draggable nodes ("orbs") on a board,
-- with references (links) drawn between them. Two additions:
--   1. canvas_x / canvas_y on each doc — its position on the board (null = not
--      placed yet; the UI auto-lays it out and saves a position on first drag).
--   2. agent_knowledge_links — directed references from one doc to another.

ALTER TABLE public.agent_knowledge
  ADD COLUMN IF NOT EXISTS canvas_x DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS canvas_y DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS public.agent_knowledge_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  from_id      UUID NOT NULL REFERENCES public.agent_knowledge(id) ON DELETE CASCADE,
  to_id        UUID NOT NULL REFERENCES public.agent_knowledge(id) ON DELETE CASCADE,
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_id, to_id),
  CHECK (from_id <> to_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_links_workspace
  ON public.agent_knowledge_links (workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_links_from
  ON public.agent_knowledge_links (from_id);

ALTER TABLE public.agent_knowledge_links ENABLE ROW LEVEL SECURITY;

-- Same access model as the knowledge docs themselves: any workspace member.
CREATE POLICY "workspace members manage agent_knowledge_links"
  ON public.agent_knowledge_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = agent_knowledge_links.workspace_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.agent_knowledge_links IS
  'Directed references between agent_knowledge docs, drawn on the knowledge canvas.';
