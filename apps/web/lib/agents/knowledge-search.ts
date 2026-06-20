import { rankKnowledge } from "@/lib/agents/knowledge";
import { embedQuery } from "@/lib/agents/embeddings";
import { embeddingsAllowedForWorkspaces } from "@/lib/agents/embedding-policy";
import { sanitizeTextForLlm } from "@/lib/privacy/pii";

/**
 * Knowledge retrieval (RAG v2): semantic search over embedded chunks, falling
 * back to keyword ranking over whole docs when embeddings are unavailable
 * (no OpenAI key, embed failure, or nothing indexed yet).
 *
 * After the direct matches, results are expanded ONE hop along the knowledge-
 * canvas reference links: a doc the user drew a reference to/from a matched doc
 * is pulled in as related context (flagged `linked`). This makes the canvas the
 * user draws actually shape what agents retrieve.
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
  /** True when pulled in via a canvas reference rather than a direct match. */
  linked?: boolean;
};

export type KnowledgeSearchResult = {
  results: KnowledgeSearchHit[];
  /** docs (keyword) or embedded chunks (semantic) considered. */
  searched: number;
  method: "semantic" | "keyword";
};

/** Below this cosine similarity a chunk is noise, not a match. */
const MIN_SIMILARITY = 0.2;
/** Cap on related docs pulled in via references, so context can't balloon. */
const LINK_EXPANSION_CAP = 4;

export async function searchKnowledgeBase(
  service: LooseClient,
  workspaceIds: string[],
  query: string,
  limit: number
): Promise<KnowledgeSearchResult | { error: string }> {
  if (workspaceIds.length === 0) return { results: [], searched: 0, method: "keyword" };

  let direct:
    | { hits: KnowledgeSearchHit[]; matchedIds: string[]; searched: number; method: "semantic" | "keyword" }
    | null = null;

  // ── Semantic path ──────────────────────────────────────────────────────────
  // Blocked (→ keyword fallback) when any target workspace is eu_only and the
  // platform OpenAI project is not EU-resident. The query text is redacted
  // before it leaves our infrastructure.
  if (await embeddingsAllowedForWorkspaces(service, workspaceIds)) {
    const vector = await embedQuery(sanitizeTextForLlm(query).value);
    if (vector) {
      const { data, error } = await service.rpc("match_agent_knowledge_chunks", {
        query_embedding: JSON.stringify(vector),
        target_workspace_ids: workspaceIds,
        match_count: limit,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        const rows = (data as Array<{
          knowledge_id: string | null;
          title: string | null;
          content: string | null;
          similarity: number | null;
        }>).filter((r) => (r.similarity ?? 0) >= MIN_SIMILARITY);
        if (rows.length > 0) {
          const hits = rows.map((r) => ({
            title: r.title ?? "Untitled",
            excerpt: (r.content ?? "").slice(0, 1200),
            similarity: Math.round((r.similarity ?? 0) * 100) / 100,
          }));
          const matchedIds = [...new Set(rows.map((r) => r.knowledge_id).filter((id): id is string => !!id))];
          direct = { hits, matchedIds, searched: data.length, method: "semantic" };
        }
      }
      // RPC missing (migration not applied), error, or nothing indexed/relevant
      // → fall through to keyword.
    }
  }

  // ── Keyword fallback ───────────────────────────────────────────────────────
  if (!direct) {
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
    const ranked = rankKnowledge(query, docs, limit);
    direct = {
      hits: ranked.map((h) => ({ title: h.title, excerpt: h.excerpt })),
      matchedIds: ranked.map((h) => h.id),
      searched: docs.length,
      method: "keyword",
    };
  }

  // ── Reference expansion (one hop along canvas links) ─────────────────────────
  const linkedHits = await expandViaLinks(service, workspaceIds, direct.matchedIds);

  return { results: [...direct.hits, ...linkedHits], searched: direct.searched, method: direct.method };
}

/**
 * Pick the related-doc ids one hop from the matched docs (either link direction),
 * excluding the matched docs themselves and de-duped, capped. Pure — unit-tested.
 */
export function neighborIdsFromLinks(
  matchedIds: string[],
  links: Array<{ from_id: string; to_id: string }>,
  cap = LINK_EXPANSION_CAP
): string[] {
  const matched = new Set(matchedIds);
  const seen = new Set(matchedIds);
  const out: string[] = [];
  for (const l of links) {
    if (out.length >= cap) break;
    const neighbor = matched.has(l.from_id) ? l.to_id : l.from_id;
    if (!matched.has(neighbor) && !seen.has(neighbor)) {
      seen.add(neighbor);
      out.push(neighbor);
    }
  }
  return out;
}

async function expandViaLinks(
  service: LooseClient,
  workspaceIds: string[],
  matchedIds: string[]
): Promise<KnowledgeSearchHit[]> {
  if (matchedIds.length === 0) return [];

  // Links touching a matched doc in either direction (two queries — cleaner than
  // an `.or()` with comma-bearing in-lists).
  const [outgoing, incoming] = await Promise.all([
    service.from("agent_knowledge_links").select("from_id, to_id").in("workspace_id", workspaceIds).in("from_id", matchedIds),
    service.from("agent_knowledge_links").select("from_id, to_id").in("workspace_id", workspaceIds).in("to_id", matchedIds),
  ]);
  const links = [
    ...((outgoing?.data ?? []) as Array<{ from_id: string; to_id: string }>),
    ...((incoming?.data ?? []) as Array<{ from_id: string; to_id: string }>),
  ];
  const neighborIds = neighborIdsFromLinks(matchedIds, links);
  if (neighborIds.length === 0) return [];

  const { data } = await service
    .from("agent_knowledge")
    .select("id, title, content")
    .in("id", neighborIds)
    .in("workspace_id", workspaceIds);
  return ((data ?? []) as Array<{ title: string | null; content: string | null }>).map((d) => ({
    title: d.title ?? "Untitled",
    excerpt: (d.content ?? "").slice(0, 1000),
    linked: true,
  }));
}
