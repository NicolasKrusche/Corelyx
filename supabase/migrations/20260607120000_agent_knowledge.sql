-- Agent knowledge base (RAG v1).
--
-- Per-workspace knowledge an agent can ground itself in — docs, playbooks, brand
-- voice, "who's who". Agents retrieve relevant snippets at runtime via the
-- corelyx.search_knowledge tool so their output reflects the user's world rather
-- than being generic.
--
-- v1 retrieval is keyword-ranked over the stored text (good for small knowledge
-- bases); a future version can add embeddings/pgvector without changing this table.

CREATE TABLE IF NOT EXISTS public.agent_knowledge (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT 'Untitled',
  content      TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_workspace
  ON public.agent_knowledge (workspace_id, created_at);

ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

-- Any member of the workspace may read/write its knowledge. Agent retrieval runs
-- through the service-role client, scoped in code to the user's workspaces.
CREATE POLICY "workspace members manage agent_knowledge" ON public.agent_knowledge
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = agent_knowledge.workspace_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.agent_knowledge IS
  'Per-workspace knowledge snippets agents retrieve via corelyx.search_knowledge (RAG v1).';
