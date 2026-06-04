import Dagre from "@dagrejs/dagre";
import type { Node as ReactFlowNode, Edge as ReactFlowEdge } from "@xyflow/react";

// Minimal structural shapes layoutSchema needs. Kept loose (rather than the
// strict @flowos/schema union) so both the editor and the Genesis route can pass
// their own node/edge types and get the same type back without casts.
interface LayoutNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  config?: unknown;
}

interface LayoutEdge {
  from: string;
  to: string;
}

const NODE_WIDTH = 200;
// Matches actual rendered node height (badge + label + description + padding).
// Overestimating slightly is safe — it just adds more spacing.
const NODE_HEIGHT = 160;

// Layout direction the user can choose. "horizontal" reads left-to-right with
// branches stacking below (matches the structured look users expect); "vertical"
// reads top-to-bottom with branches spreading sideways.
export type LayoutDirection = "horizontal" | "vertical";

export const DEFAULT_LAYOUT_DIRECTION: LayoutDirection = "horizontal";

// Node types that participate in the connected graph and are laid out by Dagre.
// note/group nodes are positioned separately (they have no edges).
const GRAPH_NODE_TYPES = new Set(["trigger", "agent", "step", "connection"]);

// Padding a group frame leaves around the children it wraps. Matches the
// convention the Genesis prompt uses for hand-emitted groups.
const GROUP_PADDING = 60;
const NOTE_DEFAULT_WIDTH = 240;
const NOTE_DEFAULT_HEIGHT = 140;
const NOTE_GAP = 28;

// ─── applyDagreLayout ─────────────────────────────────────────────────────────
// Computes automatic layout positions using Dagre.
// Direction "TB" = top-to-bottom (default), "LR" = left-to-right.
// TB is the natural direction because all node handles are at Position.Top / Bottom.
// Returns a new nodes array with updated positions. Edges are unchanged.

export function applyDagreLayout(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  direction: "TB" | "LR" = "TB"
): ReactFlowNode[] {
  const g = new Dagre.graphlib.Graph();

  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    ranksep: 100,  // gap between rows (TB) or columns (LR)
    nodesep: 60,   // gap between nodes in the same rank
    marginx: 40,
    marginy: 40,
  });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  Dagre.layout(g);

  return nodes.map((node) => {
    const layoutNode = g.node(node.id);
    if (!layoutNode) return node;

    // Dagre positions are center-based; React Flow positions are top-left.
    return {
      ...node,
      position: {
        x: layoutNode.x - NODE_WIDTH / 2,
        y: layoutNode.y - NODE_HEIGHT / 2,
      },
    };
  });
}

// ─── needsLayout ─────────────────────────────────────────────────────────────
// Detects whether a freshly-generated schema needs auto-layout applied.
// Heuristic: all nodes are stacked at the exact same position, or all at the
// canonical default (100, 100) that Genesis emits before layout is applied.

export function needsLayout(nodes: ReactFlowNode[]): boolean {
  if (nodes.length <= 1) return false;
  const positions = nodes.map((n) => n.position);
  const allSamePos = positions.every(
    (p) => p.x === positions[0].x && p.y === positions[0].y
  );
  const allDefault = positions.every((p) => p.x === 100 && p.y === 100);
  return allSamePos || allDefault;
}

// ─── layoutSchema ─────────────────────────────────────────────────────────────
// Deterministic auto-layout operating directly on a program schema's nodes and
// edges. Unlike the LLM positioning the Genesis prompt used to ask for (which
// produced straight lines), this lays the executable graph out as a proper tree
// with branches, then positions the visual-only nodes around it:
//   • trigger/agent/step/connection → Dagre (LR for horizontal, TB for vertical)
//   • group → frame recomputed to wrap its laid-out children (+padding)
//   • note → parked in a column to the left of the graph so it never overlaps
// Returns a new nodes array with updated positions (and group sizes). Edges and
// every other field are preserved.

export function layoutSchema<N extends LayoutNode>(
  nodes: N[],
  edges: readonly LayoutEdge[],
  direction: LayoutDirection = DEFAULT_LAYOUT_DIRECTION
): N[] {
  const graphNodes = nodes.filter((n) => GRAPH_NODE_TYPES.has(n.type));
  if (graphNodes.length === 0) return nodes;

  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction === "horizontal" ? "LR" : "TB",
    ranksep: 120,
    nodesep: 80,
    marginx: 40,
    marginy: 40,
  });

  const graphIds = new Set(graphNodes.map((n) => n.id));
  graphNodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => {
    if (graphIds.has(e.from) && graphIds.has(e.to)) g.setEdge(e.from, e.to);
  });

  Dagre.layout(g);

  // Dagre positions are center-based; schema positions are top-left.
  const graphPos = new Map<string, { x: number; y: number }>();
  graphNodes.forEach((n) => {
    const ln = g.node(n.id);
    if (ln) graphPos.set(n.id, { x: ln.x - NODE_WIDTH / 2, y: ln.y - NODE_HEIGHT / 2 });
  });

  // Bounding box of the laid-out graph, used to park notes alongside it.
  let minX = Infinity;
  let minY = Infinity;
  for (const p of graphPos.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
  }

  // Park note nodes in a left-hand column, top-aligned with the graph.
  const notePos = new Map<string, { x: number; y: number }>();
  let noteCursorY = minY;
  const noteColumnX = minX - NOTE_DEFAULT_WIDTH - GROUP_PADDING * 2;
  for (const node of nodes) {
    if (node.type !== "note") continue;
    notePos.set(node.id, { x: noteColumnX, y: noteCursorY });
    const noteHeight = ((node.config ?? {}) as { height?: number }).height ?? NOTE_DEFAULT_HEIGHT;
    noteCursorY += noteHeight + NOTE_GAP;
  }

  return nodes.map((node): N => {
    const graph = graphPos.get(node.id);
    if (graph) return { ...node, position: graph };

    const note = notePos.get(node.id);
    if (note) return { ...node, position: note };

    if (node.type === "group") {
      const config = (node.config ?? {}) as { childIds?: string[] };
      const childIds = config.childIds ?? [];
      const childPositions = childIds
        .map((id) => graphPos.get(id))
        .filter((p): p is { x: number; y: number } => Boolean(p));
      if (childPositions.length === 0) return node;

      let gx = Infinity;
      let gy = Infinity;
      let gMaxX = -Infinity;
      let gMaxY = -Infinity;
      for (const p of childPositions) {
        gx = Math.min(gx, p.x);
        gy = Math.min(gy, p.y);
        gMaxX = Math.max(gMaxX, p.x + NODE_WIDTH);
        gMaxY = Math.max(gMaxY, p.y + NODE_HEIGHT);
      }

      return {
        ...node,
        position: { x: gx - GROUP_PADDING, y: gy - GROUP_PADDING },
        config: {
          ...config,
          width: gMaxX - gx + GROUP_PADDING * 2,
          height: gMaxY - gy + GROUP_PADDING * 2,
        },
      };
    }

    return node;
  });
}
