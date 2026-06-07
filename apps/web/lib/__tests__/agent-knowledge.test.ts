import { describe, expect, it } from "vitest";
import { rankKnowledge, type KnowledgeDoc } from "../agents/knowledge";

const docs: KnowledgeDoc[] = [
  { id: "1", title: "Brand voice", content: "We write warm, concise, and never use exclamation marks. Friendly but professional." },
  { id: "2", title: "Refund policy", content: "Refunds are allowed within 30 days. Enterprise customers get 60 days by contract." },
  { id: "3", title: "Team roster", content: "Sarah leads sales. Marcus owns support. Ana handles billing questions." },
];

describe("rankKnowledge", () => {
  it("returns empty for an empty/stopword-only query", () => {
    expect(rankKnowledge("", docs)).toEqual([]);
    expect(rankKnowledge("the and for", docs)).toEqual([]);
  });

  it("ranks the most relevant doc first", () => {
    const hits = rankKnowledge("what is our refund policy for enterprise", docs);
    expect(hits[0].title).toBe("Refund policy");
  });

  it("weighs title matches above body matches", () => {
    const hits = rankKnowledge("brand", docs);
    expect(hits[0].title).toBe("Brand voice");
  });

  it("returns a focused excerpt around the match", () => {
    const hits = rankKnowledge("billing", docs);
    expect(hits[0].title).toBe("Team roster");
    expect(hits[0].excerpt.toLowerCase()).toContain("billing");
  });

  it("respects the limit and drops zero-score docs", () => {
    const hits = rankKnowledge("refund", docs, 5);
    expect(hits).toHaveLength(1); // only the refund doc matches
    expect(hits.every((h) => h.score > 0)).toBe(true);
  });

  it("excerpt length is bounded", () => {
    const long: KnowledgeDoc[] = [{ id: "x", title: "Long", content: "alpha ".repeat(500) + "needle " + "omega ".repeat(500) }];
    const hits = rankKnowledge("needle", long);
    expect(hits[0].excerpt.length).toBeLessThanOrEqual(282);
    expect(hits[0].excerpt).toContain("needle");
  });
});
