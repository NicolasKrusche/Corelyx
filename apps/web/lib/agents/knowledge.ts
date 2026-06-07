export type KnowledgeDoc = { id: string; title: string; content: string };

export type KnowledgeHit = { id: string; title: string; excerpt: string; score: number };

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had", "her", "was", "one",
  "our", "out", "his", "has", "how", "who", "what", "when", "where", "why", "with", "this", "that",
  "from", "have", "will", "your", "about", "into", "than", "then", "them", "they",
]);

/** Significant lowercase terms from a query (drops short words + stopwords). */
function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (w) => w.length >= 3 && !STOPWORDS.has(w)
  );
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

function excerptAround(content: string, queryTerms: string[], width = 280): string {
  const lower = content.toLowerCase();
  let pos = -1;
  for (const t of queryTerms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (pos === -1 || i < pos)) pos = i;
  }
  if (pos === -1) return content.slice(0, width).trim();
  const start = Math.max(0, pos - Math.floor(width / 3));
  const slice = content.slice(start, start + width).trim();
  return (start > 0 ? "…" : "") + slice + (start + width < content.length ? "…" : "");
}

/**
 * Keyword-rank knowledge docs against a query (RAG v1 retrieval). Title matches
 * weigh more than body matches. Returns the top hits with a focused excerpt.
 * Deterministic and dependency-free — good for small knowledge bases; a future
 * version can swap in embeddings without changing callers.
 */
export function rankKnowledge(query: string, docs: KnowledgeDoc[], limit = 3): KnowledgeHit[] {
  const qTerms = terms(query);
  if (qTerms.length === 0) return [];

  const scored = docs.map((doc) => {
    const title = (doc.title ?? "").toLowerCase();
    const content = (doc.content ?? "").toLowerCase();
    let score = 0;
    for (const t of qTerms) {
      score += countOccurrences(title, t) * 3;
      score += countOccurrences(content, t);
    }
    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 10)))
    .map((s) => ({
      id: s.doc.id,
      title: s.doc.title || "Untitled",
      excerpt: excerptAround(s.doc.content ?? "", qTerms),
      score: s.score,
    }));
}
