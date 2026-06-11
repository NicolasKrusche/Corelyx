import { rankKnowledge } from "@/lib/agents/knowledge";
import { embedQuery, embeddingsAvailable } from "@/lib/agents/embeddings";

/**
 * Knowledge retrieval (RAG v2): semantic search over embedded chunks, falling
 * back to keyword ranking over whole docs when embeddings are unavailable
 * (no OpenAI key, embed failure, or nothing indexed yet).
 *
 * Used by both the corelyx.search_knowledge agent tool and the knowledge page's
 * retrieval preview, so what the user tests is exactly what agents get.
 */

type LooseClient = {
  from(table: string): any;
  rpc(fn: string, args?: any): any;
};

export type KnowledgeSearchHit = {
  title: string;
  excerpt: string;
  /** 0–1 cosine similarity for semantic hits; keyword hits have no score. */
  similarity?: number;
};

export type KnowledgeSearchResult = {
  results: KnowledgeSearchHit[];
  /** docs (keyword) or embedded chunks (semantic) considered. */
  searched: number;
  method: "semantic" | "keyword";
};

/** Below this cosine similarity a chunk is noise, not a match. */
const MIN_SIMILARITY = 0.2;

export async function searchKnowledgeBase(
  service: LooseClient,
  workspaceIds: string[],
  query: string,
  limit: number
): Promise<KnowledgeSearchResult | { error: string }> {
  if (workspaceIds.length === 0) return { results: [], searched: 0, method: "keyword" };

  // ── Semantic path ──────────────────────────────────────────────────────────
  if (embeddingsAvailable()) {
    const vector = await embedQuery(query);
    if (vector) {
      const { data, error } = await service.rpc("match_agent_knowledge_chunks", {
        query_embedding: JSON.stringify(vector),
        target_workspace_ids: workspaceIds,
        match_count: limit,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        const hits = (data as Array<{ title: string | null; content: string | null; similarity: number | null }>)
          .filter((r) => (r.similarity ?? 0) >= MIN_SIMILARITY)
          .map((r) => ({
            title: r.title ?? "Untitled",
            excerpt: (r.content ?? "").slice(0, 1200),
            similarity: Math.round((r.similarity ?? 0) * 100) / 100,
          }));
        if (hits.length > 0) {
          return { results: hits, searched: data.length, method: "semantic" };
        }
      }
      // RPC missing (migration not applied), error, or nothing indexed/relevant
      // → fall through to keyword.
    }
  }

  // ── Keyword fallback ───────────────────────────────────────────────────────
  const { data, error } = await service
    .from("agent_knowledge")
    .select("id, title, content")
    .in("workspace_id", workspaceIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { error: error.message };

  const docs = ((data ?? []) as Array<{ id: string; title: string | null; content: string | null }>).map(
    (d) => ({ id: d.id, title: d.title ?? "Untitled", content: d.content ?? "" })
  );
  const hits = rankKnowledge(query, docs, limit).map((h) => ({ title: h.title, excerpt: h.excerpt }));
  return { results: hits, searched: docs.length, method: "keyword" };
}
