/**
 * Cross-workflow clipboard for copy/paste of nodes between programs.
 *
 * Stores a JSON blob in localStorage so selections survive tab switches and
 * navigation away from the current program. Each paste generates fresh node
 * IDs and offsets the position slightly so the paste is visually distinct.
 */

import type { ProgramSchema } from "@flowos/schema";

const CLIPBOARD_KEY = "corelyx-editor-clipboard-v1";

export interface ClipboardPayload {
  nodes: ProgramSchema["nodes"];
  edges: ProgramSchema["edges"];
}

// ─── Write ────────────────────────────────────────────────────────────────────

export function writeClipboard(payload: ClipboardPayload): void {
  try {
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full or blocked — silently ignore
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export function readClipboard(): ClipboardPayload | null {
  try {
    const raw = localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isClipboardPayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export function clearClipboard(): void {
  try {
    localStorage.removeItem(CLIPBOARD_KEY);
  } catch {
    // ignore
  }
}

// ─── Has content ──────────────────────────────────────────────────────────────

export function hasClipboard(): boolean {
  try {
    return localStorage.getItem(CLIPBOARD_KEY) !== null;
  } catch {
    return false;
  }
}

// ─── Build paste payload ──────────────────────────────────────────────────────
// Remaps all node IDs to fresh UUIDs and offsets positions so pasted nodes
// don't land exactly on top of originals.

export function buildPastePayload(
  payload: ClipboardPayload,
  offset: { x: number; y: number } = { x: 40, y: 40 }
): ClipboardPayload {
  const idMap = new Map<string, string>();

  // Generate fresh IDs for all copied nodes
  for (const node of payload.nodes) {
    idMap.set(node.id, crypto.randomUUID());
  }

  const nodes: ProgramSchema["nodes"] = payload.nodes.map((node) => ({
    ...node,
    id: idMap.get(node.id) ?? crypto.randomUUID(),
    position: {
      x: node.position.x + offset.x,
      y: node.position.y + offset.y,
    },
    // Reset execution state
    status: "idle",
  }));

  // Remap edges: only include edges where both endpoints were copied
  const edges: ProgramSchema["edges"] = payload.edges
    .filter((edge) => idMap.has(edge.from) && idMap.has(edge.to))
    .map((edge) => ({
      ...edge,
      id: crypto.randomUUID(),
      from: idMap.get(edge.from)!,
      to: idMap.get(edge.to)!,
    }));

  return { nodes, edges };
}

// ─── Type guard ───────────────────────────────────────────────────────────────

function isClipboardPayload(value: unknown): value is ClipboardPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.nodes) && Array.isArray(v.edges);
}
