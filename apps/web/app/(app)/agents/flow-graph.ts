// Pure data model + layout for the Agents "Flow" view. No JSX/React here so it
// stays unit-testable and shared with the rendering component (agents-view.tsx).

// ── Serializable view-models handed down from the server page ──
export type AgentVM = {
  id: string;
  name: string;
  description: string | null;
  state: string;
  createdAt: string;
  scheduled: boolean;
  hasQuestion: boolean;
  savedTemplate: boolean;
  lineageId: string;
  clonedFrom: string | null;
  /** Parent program id when this agent was spawned by another agent. */
  spawnedFrom: string | null;
};

/** One live reference edge from agent_relations. */
export type AgentRelationVM = {
  from: string;
  rel: "spawns" | "cross_check" | "feeds" | "reads_source";
  targetKind: "agent" | "knowledge" | "connector";
  /** program id (agent) or knowledge id; null for connector. */
  targetId: string | null;
  /** connector name; null for agent/knowledge. */
  targetLabel: string | null;
};

export type KnowledgeSourceVM = { id: string; title: string };

// ── Rendered graph shapes ──
// Relationship encoding: color + distinct dash, so it never relies on color alone.
export type Rel = "spawns" | "reads" | "feeds" | "cross";

export type FlowNode = {
  id: string;
  label: string;
  sub?: string;
  state: string;
  kind: "agent" | "orchestrator" | "source" | "connector";
  col: number;
  row: number;
  href?: string;
};
export type FlowEdge = { from: string; to: string; rel: Rel };

export type GraphCluster = { title: string; nodes: FlowNode[]; edges: FlowEdge[] };

// Map a stored relation type to the rendered edge style.
const REL_OF: Record<AgentRelationVM["rel"], Rel> = {
  spawns: "spawns",
  cross_check: "cross",
  feeds: "feeds",
  reads_source: "reads",
};

/**
 * Build laid-out clusters from real agents + live relation edges. Each connected
 * component becomes one left→right layered cluster; column = longest path on the
 * directional edges (cross-check excluded). reads_source points source→agent so
 * sources sit upstream. Lineage (cloned_from) is folded in as feeds edges so
 * re-run chains show even without explicit relations. Pure — exported for tests.
 */
export function buildFlowClusters(
  agents: AgentVM[],
  relations: AgentRelationVM[],
  knowledgeSources: KnowledgeSourceVM[]
): GraphCluster[] {
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const titleById = new Map(knowledgeSources.map((k) => [k.id, k.title]));

  type RN = { id: string; kind: FlowNode["kind"]; label: string; state: string; href?: string };
  const nodes = new Map<string, RN>();
  const edgeSet = new Set<string>();
  const edges: FlowEdge[] = [];

  const ensureAgent = (id: string): boolean => {
    if (nodes.has(id)) return true;
    const a = agentById.get(id);
    if (!a) return false;
    nodes.set(id, { id, kind: "agent", label: a.name, state: a.state, href: `/agents/${a.id}` });
    return true;
  };
  const ensureKnowledge = (kid: string): string => {
    const id = `k:${kid}`;
    if (!nodes.has(id)) nodes.set(id, { id, kind: "source", label: titleById.get(kid) ?? "Knowledge", state: "source" });
    return id;
  };
  const ensureConnector = (label: string): string => {
    const id = `c:${label}`;
    if (!nodes.has(id)) nodes.set(id, { id, kind: "connector", label, state: "source" });
    return id;
  };
  const addEdge = (from: string, to: string, rel: Rel) => {
    const key = `${from}|${to}|${rel}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ from, to, rel });
  };

  for (const r of relations) {
    if (r.targetKind === "agent") {
      if (!agentById.has(r.from) || !r.targetId || !agentById.has(r.targetId)) continue;
      ensureAgent(r.from);
      ensureAgent(r.targetId);
      addEdge(r.from, r.targetId, REL_OF[r.rel]);
    } else if (r.targetKind === "knowledge") {
      if (!agentById.has(r.from) || !r.targetId || !titleById.has(r.targetId)) continue;
      ensureAgent(r.from);
      addEdge(ensureKnowledge(r.targetId), r.from, "reads");
    } else if (r.targetKind === "connector") {
      if (!agentById.has(r.from) || !r.targetLabel) continue;
      ensureAgent(r.from);
      addEdge(ensureConnector(r.targetLabel), r.from, "reads");
    }
  }

  // Lineage re-run chains → feeds edges.
  for (const a of agents) {
    if (a.clonedFrom && agentById.has(a.clonedFrom)) {
      ensureAgent(a.clonedFrom);
      ensureAgent(a.id);
      addEdge(a.clonedFrom, a.id, "feeds");
    }
  }

  if (nodes.size === 0) return [];

  // Connected components (union-find over undirected edges).
  const parent = new Map<string, string>();
  for (const id of nodes.keys()) parent.set(id, id);
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  for (const e of edges) parent.set(find(e.from), find(e.to));

  const groups = new Map<string, string[]>();
  for (const id of nodes.keys()) {
    const root = find(id);
    const arr = groups.get(root) ?? [];
    arr.push(id);
    groups.set(root, arr);
  }

  const clusters: GraphCluster[] = [];
  for (const ids of groups.values()) {
    const idSet = new Set(ids);
    const compEdges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));

    // Longest-path depth on directional edges (cross-check is peer, ignored).
    const parents = new Map<string, string[]>();
    for (const e of compEdges) {
      if (e.rel === "cross") continue;
      const arr = parents.get(e.to) ?? [];
      arr.push(e.from);
      parents.set(e.to, arr);
    }
    const depthMemo = new Map<string, number>();
    const inProgress = new Set<string>();
    const depth = (id: string): number => {
      if (depthMemo.has(id)) return depthMemo.get(id)!;
      if (inProgress.has(id)) return 0; // cycle guard
      inProgress.add(id);
      let d = 0;
      for (const p of parents.get(id) ?? []) d = Math.max(d, depth(p) + 1);
      inProgress.delete(id);
      depthMemo.set(id, d);
      return d;
    };

    const ordered = [...ids].sort((a, b) => {
      const na = nodes.get(a)!;
      const nb = nodes.get(b)!;
      const ka = na.kind === "agent" ? 0 : 1;
      const kb = nb.kind === "agent" ? 0 : 1;
      return ka - kb || na.label.localeCompare(nb.label);
    });
    const rowByCol = new Map<number, number>();
    const flowNodes: FlowNode[] = ordered.map((id) => {
      const n = nodes.get(id)!;
      const col = depth(id);
      const row = rowByCol.get(col) ?? 0;
      rowByCol.set(col, row + 1);
      return { id: n.id, label: n.label, state: n.state, kind: n.kind, col, row, href: n.href };
    });

    const rootAgent =
      flowNodes.find((n) => n.kind === "agent" && n.col === 0) ??
      flowNodes.find((n) => n.kind === "agent");
    const agentCount = flowNodes.filter((n) => n.kind === "agent").length;
    clusters.push({
      title: `${rootAgent?.label ?? "Linked sources"} · ${agentCount} agent${agentCount === 1 ? "" : "s"}`,
      nodes: flowNodes,
      edges: compEdges,
    });
  }

  clusters.sort((a, b) => b.nodes.length - a.nodes.length);
  return clusters;
}
