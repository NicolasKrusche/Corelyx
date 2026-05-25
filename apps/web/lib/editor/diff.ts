/**
 * Schema diff utilities for version comparison in the advanced editor.
 *
 * Compares two sets of nodes/edges and produces a structured diff that the
 * VersionDiffOverlay can render. Uses the version_history snapshots embedded
 * in the program schema — no additional API call required.
 */

import type { ProgramSchema } from "@flowos/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiffChangeKind = "added" | "removed" | "modified";

export interface NodeDiff {
  kind: DiffChangeKind;
  id: string;
  label: string;
  type: string;
  /** Present on modified nodes — fields whose values changed. */
  changedFields?: string[];
}

export interface EdgeDiff {
  kind: DiffChangeKind;
  id: string;
  from: string;
  to: string;
}

export interface SchemaDiff {
  nodes: NodeDiff[];
  edges: EdgeDiff[];
  isIdentical: boolean;
}

// ─── Main diff function ───────────────────────────────────────────────────────

export function diffSchemas(
  base: { nodes: ProgramSchema["nodes"]; edges: ProgramSchema["edges"] },
  current: { nodes: ProgramSchema["nodes"]; edges: ProgramSchema["edges"] }
): SchemaDiff {
  const nodeDiffs: NodeDiff[] = [];
  const edgeDiffs: EdgeDiff[] = [];

  // ── Node diff ─────────────────────────────────────────────────────────────

  const baseNodeMap = new Map(base.nodes.map((n) => [n.id, n]));
  const currentNodeMap = new Map(current.nodes.map((n) => [n.id, n]));

  // Added nodes
  for (const node of current.nodes) {
    if (!baseNodeMap.has(node.id)) {
      nodeDiffs.push({ kind: "added", id: node.id, label: node.label, type: node.type });
    }
  }

  // Removed nodes
  for (const node of base.nodes) {
    if (!currentNodeMap.has(node.id)) {
      nodeDiffs.push({ kind: "removed", id: node.id, label: node.label, type: node.type });
    }
  }

  // Modified nodes
  for (const node of current.nodes) {
    const baseNode = baseNodeMap.get(node.id);
    if (!baseNode) continue;
    const changed = getChangedFields(baseNode, node);
    if (changed.length > 0) {
      nodeDiffs.push({ kind: "modified", id: node.id, label: node.label, type: node.type, changedFields: changed });
    }
  }

  // ── Edge diff ─────────────────────────────────────────────────────────────

  const baseEdgeMap = new Map(base.edges.map((e) => [e.id, e]));
  const currentEdgeMap = new Map(current.edges.map((e) => [e.id, e]));

  for (const edge of current.edges) {
    if (!baseEdgeMap.has(edge.id)) {
      edgeDiffs.push({ kind: "added", id: edge.id, from: edge.from, to: edge.to });
    }
  }

  for (const edge of base.edges) {
    if (!currentEdgeMap.has(edge.id)) {
      edgeDiffs.push({ kind: "removed", id: edge.id, from: edge.from, to: edge.to });
    }
  }

  return {
    nodes: nodeDiffs,
    edges: edgeDiffs,
    isIdentical: nodeDiffs.length === 0 && edgeDiffs.length === 0,
  };
}

// ─── Field-level change detection ─────────────────────────────────────────────

function getChangedFields(
  a: ProgramSchema["nodes"][0],
  b: ProgramSchema["nodes"][0]
): string[] {
  const changed: string[] = [];
  if (a.label !== b.label) changed.push("label");
  if (a.description !== b.description) changed.push("description");
  if (JSON.stringify(a.config) !== JSON.stringify(b.config)) changed.push("config");
  if (a.connection !== b.connection) changed.push("connection");
  return changed;
}

// ─── Fetch snapshot from version_history ──────────────────────────────────────

export function getVersionSnapshot(
  schema: ProgramSchema,
  versionNumber: number
): { nodes: ProgramSchema["nodes"]; edges: ProgramSchema["edges"] } | null {
  const snapshot = schema.version_history.find(
    (v) => v.version_number === versionNumber
  );
  if (!snapshot) return null;
  return { nodes: snapshot.snapshot.nodes, edges: snapshot.snapshot.edges };
}
