import { describe, expect, it } from "vitest";

import {
  applyGenesisPatch,
  diffSchemas,
  GenesisPatchZ,
  isEmptyPatchSummary,
  isGenesisPatch,
} from "../patch";

const baseSchema = () => ({
  version: "1.0",
  program_id: "p1",
  program_name: "Digest",
  execution_mode: "autonomous",
  nodes: [
    { id: "n1", type: "trigger", label: "Cron", config: { trigger_type: "cron" }, position: { x: 0, y: 0 } },
    { id: "n2", type: "connection", label: "Fetch", config: { operation: "list_emails" }, position: { x: 320, y: 0 } },
    { id: "n3", type: "connection", label: "Send", config: { operation: "send_message" }, position: { x: 640, y: 0 } },
    { id: "g1", type: "group", label: "Pipeline", config: { childIds: ["n2", "n3"], width: 700, height: 200 }, position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", type: "data_flow" },
    { id: "e2", from: "n2", to: "n3", type: "data_flow" },
  ],
  triggers: [{ node_id: "n1", type: "cron", is_active: true }],
});

describe("isGenesisPatch", () => {
  it("distinguishes patches from full schemas", () => {
    expect(isGenesisPatch({ patch_version: "1" })).toBe(true);
    expect(isGenesisPatch({ update: { nodes: [] } })).toBe(true);
    expect(isGenesisPatch({ nodes: [], edges: [] })).toBe(false);
    expect(isGenesisPatch(null)).toBe(false);
    expect(isGenesisPatch([])).toBe(false);
  });
});

describe("applyGenesisPatch", () => {
  it("updates only the listed fields, replacing config wholesale", () => {
    const patch = GenesisPatchZ.parse({
      patch_version: "1",
      change_summary: "Point the send step at a different operation",
      update: { nodes: [{ id: "n3", label: "Send to Teams", config: { operation: "send_teams" } }] },
    });
    const { schema, summary } = applyGenesisPatch(baseSchema(), patch);

    const n3 = (schema.nodes as Array<{ id: string; label?: string; config?: Record<string, unknown> }>).find((n) => n.id === "n3")!;
    expect(n3.label).toBe("Send to Teams");
    expect(n3.config).toEqual({ operation: "send_teams" });
    // Untouched nodes stay byte-identical.
    const n2 = (schema.nodes as Array<{ id: string }>).find((n) => n.id === "n2");
    expect(n2).toEqual(baseSchema().nodes[1]);
    expect(summary.updated_node_ids).toEqual(["n3"]);
    expect(summary.change_summary).toContain("different operation");
  });

  it("removing a node cascades to its edges, triggers, and group childIds", () => {
    const patch = GenesisPatchZ.parse({
      patch_version: "1",
      remove: { node_ids: ["n3"] },
    });
    const { schema, summary } = applyGenesisPatch(baseSchema(), patch);

    expect((schema.nodes as Array<{ id: string }>).map((n) => n.id)).toEqual(["n1", "n2", "g1"]);
    expect((schema.edges as Array<{ id: string }>).map((e) => e.id)).toEqual(["e1"]);
    const group = (schema.nodes as Array<{ id: string; config?: { childIds?: string[] } }>).find((n) => n.id === "g1")!;
    expect(group.config?.childIds).toEqual(["n2"]);
    expect(summary.removed_node_ids).toEqual(["n3"]);
    expect(summary.removed_edge_ids).toEqual(["e2"]);
  });

  it("adds nodes and edges; colliding adds become updates", () => {
    const patch = GenesisPatchZ.parse({
      patch_version: "1",
      add: {
        nodes: [
          { id: "n4", type: "step", label: "Filter", config: { logic_type: "filter" }, position: { x: 500, y: 200 } },
          { id: "n2", type: "connection", label: "Fetch more", config: { operation: "list_emails", max: 50 } },
        ],
        edges: [{ id: "e3", from: "n2", to: "n4", type: "data_flow" }],
      },
    });
    const { schema, summary } = applyGenesisPatch(baseSchema(), patch);

    expect((schema.nodes as Array<{ id: string }>).some((n) => n.id === "n4")).toBe(true);
    expect(summary.added_node_ids).toEqual(["n4"]);
    expect(summary.updated_node_ids).toEqual(["n2"]);
    expect(summary.added_edge_ids).toEqual(["e3"]);
  });

  it("treats an update for a missing id as an add when it is a complete node", () => {
    const patch = GenesisPatchZ.parse({
      patch_version: "1",
      update: {
        nodes: [
          { id: "n9", type: "step", label: "New", config: { logic_type: "delay" }, position: { x: 0, y: 0 } },
          { id: "n8", label: "fragment without type" },
        ],
      },
    });
    const { schema, summary } = applyGenesisPatch(baseSchema(), patch);

    expect((schema.nodes as Array<{ id: string }>).some((n) => n.id === "n9")).toBe(true);
    expect((schema.nodes as Array<{ id: string }>).some((n) => n.id === "n8")).toBe(false);
    expect(summary.added_node_ids).toEqual(["n9"]);
  });

  it("never mutates the input schema and always bumps updated_at", () => {
    const original = baseSchema();
    const snapshot = JSON.parse(JSON.stringify(original));
    const { schema } = applyGenesisPatch(original, GenesisPatchZ.parse({ patch_version: "1", remove: { node_ids: ["n2"] } }));

    expect(original).toEqual(snapshot);
    expect(typeof schema.updated_at).toBe("string");
  });

  it("an empty patch produces an empty summary", () => {
    const { summary } = applyGenesisPatch(
      baseSchema(),
      GenesisPatchZ.parse({ patch_version: "1", change_summary: "No changes needed" })
    );
    expect(isEmptyPatchSummary(summary)).toBe(true);
    expect(summary.change_summary).toBe("No changes needed");
  });
});

describe("diffSchemas", () => {
  it("computes added/updated/removed ids between two full schemas", () => {
    const before = baseSchema();
    const after = baseSchema();
    after.nodes = after.nodes.filter((n) => n.id !== "n3");
    (after.nodes[1] as { label: string }).label = "Fetch unread";
    after.nodes.push({ id: "n5", type: "step", label: "Sort", config: {}, position: { x: 900, y: 0 } } as never);
    after.edges = after.edges.filter((e) => e.id !== "e2");

    const summary = diffSchemas(before, after);
    expect(summary.added_node_ids).toEqual(["n5"]);
    expect(summary.updated_node_ids).toEqual(["n2"]);
    expect(summary.removed_node_ids).toEqual(["n3"]);
    expect(summary.removed_edge_ids).toEqual(["e2"]);
  });
});
