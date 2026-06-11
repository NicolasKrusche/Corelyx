/**
 * Paragraph-aware text chunking for knowledge indexing (RAG v2).
 *
 * Long docs retrieve poorly as a single embedding — a 50-page PDF averaged
 * into one vector matches nothing well. Splitting into overlapping chunks of a
 * few paragraphs each keeps every embedding focused on one topic, so queries
 * land on the relevant section instead of whole-doc noise.
 */

export type ChunkOptions = {
  /** Soft maximum characters per chunk (≈400 tokens at 4 chars/token). */
  maxChars?: number;
  /** Characters of trailing context carried into the next chunk. */
  overlapChars?: number;
};

const DEFAULT_MAX_CHARS = 1600;
const DEFAULT_OVERLAP = 200;

/** Split oversized paragraphs on sentence boundaries, hard-wrapping as a last resort. */
function splitLongBlock(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) return [block];
  const sentences = block.match(/[^.!?\n]+[.!?]?\s*/g) ?? [block];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxChars) {
      parts.push(current.trim());
      current = "";
    }
    // A single sentence longer than maxChars gets hard-wrapped.
    if (sentence.length > maxChars) {
      for (let i = 0; i < sentence.length; i += maxChars) {
        parts.push(sentence.slice(i, i + maxChars).trim());
      }
      continue;
    }
    current += sentence;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter((p) => p.length > 0);
}

/**
 * Split `content` into overlapping chunks along paragraph boundaries.
 * Deterministic; never returns empty chunks. Short content yields one chunk.
 */
export function chunkText(content: string, options: ChunkOptions = {}): string[] {
  const maxChars = Math.max(200, options.maxChars ?? DEFAULT_MAX_CHARS);
  const overlap = Math.min(
    Math.max(0, options.overlapChars ?? DEFAULT_OVERLAP),
    Math.floor(maxChars / 2)
  );

  const text = content.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  // Paragraphs first; oversized ones are split on sentences.
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .flatMap((b) => splitLongBlock(b, maxChars));

  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > maxChars) {
      chunks.push(current.trim());
      // Carry the tail of the previous chunk as context for the next one.
      current = overlap > 0 ? current.slice(-overlap).trimStart() + "\n\n" : "";
    }
    current += (current ? "\n\n" : "") + block;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
