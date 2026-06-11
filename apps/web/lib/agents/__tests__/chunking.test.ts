import { describe, it, expect } from "vitest";
import { chunkText } from "../chunking";

describe("chunkText", () => {
  it("returns empty array for blank content", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("returns one chunk for short content", () => {
    const text = "Our refund policy: full refund within 30 days.";
    expect(chunkText(text)).toEqual([text]);
  });

  it("splits long content into multiple chunks under the limit", () => {
    const paragraph = "This is a sentence about our brand voice and tone. ".repeat(10);
    const text = Array.from({ length: 10 }, (_, i) => `Section ${i}.\n${paragraph}`).join("\n\n");
    const chunks = chunkText(text, { maxChars: 1000, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1000 + 200); // limit + carried overlap
      expect(c.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries overlap context between chunks", () => {
    const text = `${"alpha ".repeat(120)}\n\n${"bravo ".repeat(120)}`;
    const chunks = chunkText(text, { maxChars: 800, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // The second chunk should carry the tail of the first as context (overlap).
    expect(chunks[1]).toContain("alpha");
    expect(chunks[1].indexOf("alpha")).toBeLessThan(chunks[1].indexOf("bravo"));
  });

  it("splits a single huge paragraph on sentence boundaries", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(100);
    const chunks = chunkText(text, { maxChars: 600, overlapChars: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(600);
  });

  it("hard-wraps pathological unbroken text", () => {
    const text = "x".repeat(5000);
    const chunks = chunkText(text, { maxChars: 1000, overlapChars: 0 });
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    expect(chunks.join("").length).toBe(5000);
  });

  it("preserves all distinct sections across chunks", () => {
    const sections = ["UNIQUE_AAA", "UNIQUE_BBB", "UNIQUE_CCC", "UNIQUE_DDD"];
    const text = sections.map((s) => `${s} ${"filler ".repeat(100)}`).join("\n\n");
    const chunks = chunkText(text, { maxChars: 800, overlapChars: 50 });
    const joined = chunks.join("\n");
    for (const s of sections) expect(joined).toContain(s);
  });
});
