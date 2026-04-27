import Dagre from "@dagrejs/dagre";
import type { Node as ReactFlowNode, Edge as ReactFlowEdge } from "@xyflow/react";

const NODE_WIDTH = 200;
// Matches actual rendered node height (badge + label + description + padding).
// Overestimating slightly is safe — it just adds more spacing.
const NODE_HEIGHT = 160;

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
