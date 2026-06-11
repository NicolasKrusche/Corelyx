import OpenAI from "openai";

/**
 * Embeddings for knowledge retrieval (RAG v2). Server-only — the OpenAI key
 * never reaches the client. Everything degrades gracefully: when no key is
 * configured (or the API errors) callers fall back to keyword retrieval, so
 * self-hosted installs without an OpenAI key keep working.
 */

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** Max texts per embeddings request (API limit is 2048; stay well under it). */
const MAX_BATCH = 256;
/** Each input is truncated to stay inside the model's 8191-token window. */
const MAX_INPUT_CHARS = 24_000;

export function embeddingsAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

/**
 * Embed a batch of texts. Returns one vector per input, in order, or `null`
 * when embeddings are unavailable (no key) or the API call fails. Never throws.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const client = getClient();
  if (!client) return null;

  try {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const batch = texts
        .slice(i, i + MAX_BATCH)
        .map((t) => t.slice(0, MAX_INPUT_CHARS) || " ");
      const res = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      // The API returns embeddings with an index — sort to be safe.
      const sorted = [...res.data].sort((a, b) => a.index - b.index);
      for (const item of sorted) vectors.push(item.embedding);
    }
    return vectors.length === texts.length ? vectors : null;
  } catch {
    // Quota, network, or auth issues — callers fall back to keyword search.
    return null;
  }
}

/** Embed a single query string. Null when unavailable — caller falls back. */
export async function embedQuery(query: string): Promise<number[] | null> {
  const vectors = await embedTexts([query]);
  return vectors?.[0] ?? null;
}
