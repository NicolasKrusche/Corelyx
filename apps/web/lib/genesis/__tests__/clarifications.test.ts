import { describe, expect, it } from "vitest";

import { extractClarifications, MAX_CLARIFICATIONS } from "../clarifications";
import { buildGenesisSystemPrompt, buildRefinementUserMessage } from "../prompt";

const schemaWith = (clarifications: unknown) => ({
  program_name: "Test",
  nodes: [
    { id: "n1", type: "trigger" },
    { id: "n2", type: "connection" },
    { id: "n3", type: "connection" },
  ],
  edges: [],
  clarifications,
});

describe("extractClarifications", () => {
  it("strips the sidecar from the schema and returns valid entries", () => {
    const schema = schemaWith([
      { node_id: "n2", question: "Which channel should the summary go to?", blocked_node_ids: ["n3"] },
    ]);
    const clarifications = extractClarifications(schema);

    expect("clarifications" in schema).toBe(false);
    expect(clarifications).toHaveLength(1);
    expect(clarifications[0]!.node_id).toBe("n2");
    expect(clarifications[0]!.blocked_node_ids).toEqual(["n3"]);
  });

  it("drops entries referencing nodes that don't exist and filters blocked ids", () => {
    const clarifications = extractClarifications(
      schemaWith([
        { node_id: "n99", question: "Ghost node?" },
        { node_id: "n2", question: "Real one?", blocked_node_ids: ["n3", "n42"] },
      ])
    );
    expect(clarifications).toHaveLength(1);
    expect(clarifications[0]!.blocked_node_ids).toEqual(["n3"]);
  });

  it("caps at MAX_CLARIFICATIONS and tolerates malformed entries", () => {
    const entries = [
      { node_id: "n1", question: "q1" },
      "garbage",
      { node_id: "n2", question: "" },
      { node_id: "n2", question: "q2" },
      { node_id: "n3", question: "q3" },
      { node_id: "n1", question: "q4" },
    ];
    const clarifications = extractClarifications(schemaWith(entries));
    expect(clarifications.length).toBeLessThanOrEqual(MAX_CLARIFICATIONS);
    expect(clarifications.map((c) => c.question)).toEqual(["q1", "q2", "q3"]);
  });

  it("is a no-op for schemas without the sidecar and non-objects", () => {
    expect(extractClarifications(schemaWith(undefined))).toEqual([]);
    expect(extractClarifications(null)).toEqual([]);
    expect(extractClarifications("text")).toEqual([]);
  });
});

describe("prompt integration", () => {
  it("includes the clarifications section only when generation allows it", () => {
    const withQuestions = buildGenesisSystemPrompt(null, null, null, { allowClarifications: true });
    const without = buildGenesisSystemPrompt(null, null, null);

    expect(withQuestions).toContain("CLARIFYING QUESTIONS");
    expect(without).not.toContain("CLARIFYING QUESTIONS");
  });

  it("includes the live capability section when provided", () => {
    const prompt = buildGenesisSystemPrompt(null, null, "LIVE CONNECTION CAPABILITIES:\n  - test");
    expect(prompt).toContain("LIVE CONNECTION CAPABILITIES");
  });

  it("refinement asks for a full schema by default (V1), a patch under V2", () => {
    // Default (dev V2 off) preserves the pre-V2 full-schema edit contract.
    const v1 = buildRefinementUserMessage("add a filter", { nodes: [] }, []);
    expect(v1).toContain("not a patch");
    expect(v1).not.toContain("return a PATCH");

    // V2 (dev-gated) opts into patch output.
    const v2 = buildRefinementUserMessage("add a filter", { nodes: [] }, [], null, { usePatch: true });
    expect(v2).toContain("return a PATCH");
    expect(v2).toContain("patch_version");
  });
});
