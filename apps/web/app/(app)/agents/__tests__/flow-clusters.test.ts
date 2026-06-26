import { describe, expect, it } from "vitest";
import {
  buildFlowClusters,
  type AgentVM,
  type AgentRelationVM,
} from "../flow-graph";

function agent(id: string, over: Partial<AgentVM> = {}): AgentVM {
  return {
    id,
    name: `Agent ${id}`,
    description: null,
    state: "completed",
    createdAt: "2026-01-01T00:00:00Z",
    scheduled: false,
    hasQuestion: false,
    savedTemplate: false,
    lineageId: id,
    clonedFrom: null,
    spawnedFrom: null,
    ...over,
  };
}

const rel = (
  from: string,
  r: AgentRelationVM["rel"],
  targetKind: AgentRelationVM["targetKind"],
  targetId: string | null,
  targetLabel: string | null = null
): AgentRelationVM => ({ from, rel: r, targetKind, targetId, targetLabel });

describe("buildFlowClusters", () => {
  it("returns no clusters when nothing references anything", () => {
    expect(buildFlowClusters([agent("a"), agent("b")], [], [])).toEqual([]);
  });

  it("lays out a spawns edge parent→child across columns", () => {
    const clusters = buildFlowClusters(
      [agent("a"), agent("b")],
      [rel("a", "spawns", "agent", "b")],
      []
    );
    expect(clusters).toHaveLength(1);
    const { nodes, edges } = clusters[0];
    expect(edges).toEqual([{ from: "a", to: "b", rel: "spawns" }]);
    const a = nodes.find((n) => n.id === "a")!;
    const b = nodes.find((n) => n.id === "b")!;
    expect(a.col).toBe(0);
    expect(b.col).toBe(1);
  });

  it("draws reads_source from the knowledge node into the agent (source upstream)", () => {
    const clusters = buildFlowClusters(
      [agent("a")],
      [rel("a", "reads_source", "knowledge", "k1")],
      [{ id: "k1", title: "Brand voice" }]
    );
    expect(clusters).toHaveLength(1);
    const { nodes, edges } = clusters[0];
    expect(edges).toEqual([{ from: "k:k1", to: "a", rel: "reads" }]);
    const src = nodes.find((n) => n.id === "k:k1")!;
    const a = nodes.find((n) => n.id === "a")!;
    expect(src.kind).toBe("source");
    expect(src.label).toBe("Brand voice");
    expect(src.col).toBe(0);
    expect(a.col).toBe(1);
  });

  it("renders a connector source node for connector reads", () => {
    const clusters = buildFlowClusters(
      [agent("a")],
      [rel("a", "reads_source", "connector", null, "Gmail")],
      []
    );
    const node = clusters[0].nodes.find((n) => n.id === "c:Gmail")!;
    expect(node.kind).toBe("connector");
    expect(node.label).toBe("Gmail");
    expect(clusters[0].edges).toEqual([{ from: "c:Gmail", to: "a", rel: "reads" }]);
  });

  it("treats cross-check as a peer (same column) edge", () => {
    const clusters = buildFlowClusters(
      [agent("a"), agent("b")],
      [rel("a", "cross_check", "agent", "b")],
      []
    );
    const { nodes, edges } = clusters[0];
    expect(edges[0].rel).toBe("cross");
    expect(nodes.find((n) => n.id === "a")!.col).toBe(0);
    expect(nodes.find((n) => n.id === "b")!.col).toBe(0);
  });

  it("synthesizes a feeds edge from lineage cloned_from", () => {
    const clusters = buildFlowClusters(
      [agent("a"), agent("b", { clonedFrom: "a" })],
      [],
      []
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].edges).toEqual([{ from: "a", to: "b", rel: "feeds" }]);
  });

  it("ignores edges whose target agent is missing or out of scope", () => {
    const clusters = buildFlowClusters([agent("a")], [rel("a", "spawns", "agent", "ghost")], []);
    expect(clusters).toEqual([]);
  });
});
