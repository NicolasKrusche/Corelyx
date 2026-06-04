import { describe, expect, it } from "vitest";
import { layoutSchema } from "../layout";
import type { Node as SchemaNode, Edge as SchemaEdge } from "@flowos/schema";

// Minimal node/edge builders — only the fields layoutSchema reads matter.
function node(id: string, type: SchemaNode["type"], config: Record<string, unknown> = {}): SchemaNode {
  return {
    id,
    type,
    label: id,
    description: "",
    connection: null,
    position: { x: 0, y: 0 },
    status: "idle",
    config,
  } as unknown as SchemaNode;
}

function edge(from: string, to: string): SchemaEdge {
  return {
    id: `${from}-${to}`,
    from,
    to,
    type: "data_flow",
    data_mapping: null,
    condition: null,
    label: null,
  };
}

describe("layoutSchema", () => {
  it("spreads a branch onto a distinct cross-axis track (not a straight line)", () => {
    // trigger → split into two branches a/b. Horizontal layout = LR, so the two
    // branches must land at different Y values (stacked), not all on one line.
    const nodes = [
      node("t", "trigger"),
      node("a", "connection"),
      node("b", "connection"),
    ];
    const edges = [edge("t", "a"), edge("t", "b")];

    const out = layoutSchema(nodes, edges, "horizontal");
    const a = out.find((n) => n.id === "a")!;
    const b = out.find((n) => n.id === "b")!;
    const t = out.find((n) => n.id === "t")!;

    // Branches advance along x past the trigger…
    expect(a.position.x).toBeGreaterThan(t.position.x);
    expect(b.position.x).toBeGreaterThan(t.position.x);
    // …and are separated on the y axis from each other.
    expect(a.position.y).not.toBe(b.position.y);
  });

  it("uses the cross axis matching the direction", () => {
    const nodes = [node("t", "trigger"), node("a", "connection"), node("b", "connection")];
    const edges = [edge("t", "a"), edge("t", "b")];

    const horizontal = layoutSchema(nodes, edges, "horizontal");
    const vertical = layoutSchema(nodes, edges, "vertical");

    const hA = horizontal.find((n) => n.id === "a")!;
    const hB = horizontal.find((n) => n.id === "b")!;
    const vA = vertical.find((n) => n.id === "a")!;
    const vB = vertical.find((n) => n.id === "b")!;

    // Horizontal branches differ on y; vertical branches differ on x.
    expect(hA.position.y).not.toBe(hB.position.y);
    expect(vA.position.x).not.toBe(vB.position.x);
  });

  it("recomputes a group frame to wrap its laid-out children", () => {
    const nodes = [
      node("t", "trigger"),
      node("a", "connection"),
      node("b", "connection"),
      node("grp", "group", { childIds: ["a", "b"], width: 10, height: 10, color: "blue" }),
    ];
    const edges = [edge("t", "a"), edge("a", "b")];

    const out = layoutSchema(nodes, edges, "horizontal");
    const a = out.find((n) => n.id === "a")!;
    const b = out.find((n) => n.id === "b")!;
    const grp = out.find((n) => n.id === "grp")!;
    const cfg = grp.config as { width: number; height: number; color: string };

    // Frame starts above-left of the leftmost/topmost child…
    expect(grp.position.x).toBeLessThanOrEqual(Math.min(a.position.x, b.position.x));
    expect(grp.position.y).toBeLessThanOrEqual(Math.min(a.position.y, b.position.y));
    // …is larger than the stub size it came in with, and keeps unrelated config.
    expect(cfg.width).toBeGreaterThan(10);
    expect(cfg.height).toBeGreaterThan(10);
    expect(cfg.color).toBe("blue");
  });

  it("parks note nodes in a column left of the graph", () => {
    const nodes = [
      node("t", "trigger"),
      node("a", "connection"),
      node("note1", "note", { content: "hi", color: "yellow" }),
      node("note2", "note", { content: "there", color: "blue" }),
    ];
    const edges = [edge("t", "a")];

    const out = layoutSchema(nodes, edges, "horizontal");
    const t = out.find((n) => n.id === "t")!;
    const note1 = out.find((n) => n.id === "note1")!;
    const note2 = out.find((n) => n.id === "note2")!;

    // Notes sit to the left of the graph and stack vertically.
    expect(note1.position.x).toBeLessThan(t.position.x);
    expect(note2.position.x).toBeLessThan(t.position.x);
    expect(note2.position.y).toBeGreaterThan(note1.position.y);
  });

  it("returns nodes unchanged when there is no executable graph", () => {
    const nodes = [node("note1", "note", { content: "x", color: "yellow" })];
    const out = layoutSchema(nodes, [], "horizontal");
    expect(out).toBe(nodes);
  });
});
