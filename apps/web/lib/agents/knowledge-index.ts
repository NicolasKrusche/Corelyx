import { chunkText } from "@/lib/agents/chunking";
import { embedTexts, embeddingsAvailable } from "@/lib/agents/embeddings";

/**
 * Knowledge indexing pipeline (RAG v2): chunk a doc, embed the chunks, and
 * persist them to agent_knowledge_chunks so corelyx.search_knowledge can
 * retrieve semantically. Safe to re-run — old chunks are replaced atomically
 * enough for this use (delete then insert).
 *
 * Failure never blocks saving the doc itself: the doc's embedding_status is
 * set to 'skipped' (no key) or 'failed' (API error) and retrieval falls back
 * to keyword ranking for that doc.
 */

type LooseClient = { from(table: string): any };

export type IndexResult = { status: "ready" | "skipped" | "failed"; chunks: number };

export async function indexKnowledgeDoc(
  service: LooseClient,
  doc: { id: string; workspaceId: string; content: string }
): Promise<IndexResult> {
  const finish = async (status: IndexResult["status"], chunks: number): Promise<IndexResult> => {
    await service
      .from("agent_knowledge")
      .update({ embedding_status: status, updated_at: new Date().toISOString() } as never)
      .eq("id", doc.id);
    return { status, chunks };
  };

  // Replace any chunks from a previous version of the doc.
  await service.from("agent_knowledge_chunks").delete().eq("knowledge_id", doc.id);

  const chunks = chunkText(doc.content);
  if (chunks.length === 0) return finish("ready", 0);

  if (!embeddingsAvailable()) return finish("skipped", 0);

  const vectors = await embedTexts(chunks);
  if (!vectors) return finish("failed", 0);

  const rows = chunks.map((content, i) => ({
    knowledge_id: doc.id,
    workspace_id: doc.workspaceId,
    chunk_index: i,
    content,
    // pgvector accepts the JSON array literal for vector columns.
    embedding: JSON.stringify(vectors[i]),
  }));

  const { error } = await service.from("agent_knowledge_chunks").insert(rows as never);
  if (error) return finish("failed", 0);
  return finish("ready", rows.length);
}
