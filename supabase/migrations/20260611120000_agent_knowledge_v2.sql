-- Agent knowledge v2: semantic retrieval + file sources.
--
-- Upgrades RAG v1 (keyword-ranked agent_knowledge) with:
--   1. pgvector chunk embeddings — docs are split into overlapping chunks and
--      embedded (text-embedding-3-small, 1536d) so corelyx.search_knowledge can
--      retrieve by meaning, not just keyword overlap.
--   2. File sources — docs can now come from uploaded files (PDF/Markdown/text),
--      tracked via source_type/source_name.
--
-- Keyword retrieval remains the fallback when no embedding key is configured
-- (embedding_status = 'skipped') or embedding failed, so nothing breaks without
-- an OpenAI key.

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Source + indexing metadata on the parent doc ────────────────────────────
ALTER TABLE public.agent_knowledge
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS source_name TEXT,
  ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'pending';

COMMENT ON COLUMN public.agent_knowledge.source_type IS
  'How the doc was added: text (typed/pasted) or file (uploaded).';
COMMENT ON COLUMN public.agent_knowledge.source_name IS
  'Original filename for file sources.';
COMMENT ON COLUMN public.agent_knowledge.embedding_status IS
  'Chunk-embedding state: pending | ready | failed | skipped (no embedding key).';

-- ── Chunked embeddings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_knowledge_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id UUID NOT NULL REFERENCES public.agent_knowledge(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL DEFAULT 0,
  content      TEXT NOT NULL,
  embedding    vector(1536),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_chunks_doc
  ON public.agent_knowledge_chunks (knowledge_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_chunks_workspace
  ON public.agent_knowledge_chunks (workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_chunks_embedding
  ON public.agent_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.agent_knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Same access model as the parent table: any workspace member. Writes happen
-- through the web app's service-role client (indexing pipeline), reads via the
-- match RPC below.
CREATE POLICY "workspace members manage agent_knowledge_chunks"
  ON public.agent_knowledge_chunks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = agent_knowledge_chunks.workspace_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.agent_knowledge_chunks IS
  'Embedded chunks of agent_knowledge docs for semantic retrieval (RAG v2).';

-- ── Semantic match RPC ──────────────────────────────────────────────────────
-- Called by the web app (service role) with the user's workspace ids already
-- resolved — workspace scoping is enforced by the caller, mirroring how every
-- other agent tool query is scoped in lib/agents/tool-execution.ts.
CREATE OR REPLACE FUNCTION public.match_agent_knowledge_chunks(
  query_embedding vector(1536),
  target_workspace_ids UUID[],
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  knowledge_id UUID,
  title TEXT,
  content TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.id AS chunk_id,
    c.knowledge_id,
    k.title,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.agent_knowledge_chunks c
  JOIN public.agent_knowledge k ON k.id = c.knowledge_id
  WHERE c.workspace_id = ANY (target_workspace_ids)
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;
