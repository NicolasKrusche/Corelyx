import { jsonrepair } from "jsonrepair";
import { extractJson } from "./parsing";

export type PartialNode = {
  id: string;
  type: "trigger" | "agent" | "step" | "connection" | "note" | "group";
  label?: string;
  description?: string;
  connection?: string | null;
  config?: unknown;
  position?: { x: number; y: number };
};

export type PartialEdge = {
  id: string;
  from: string;
  to: string;
  type?: string;
  label?: string | null;
};

export type PartialDelta = {
  programName?: string;
  newNodes: PartialNode[];
  newEdges: PartialEdge[];
};

// Incrementally parses a streaming Genesis JSON response and reports newly-
// completed nodes and edges. On each `feed()`, the buffer is repair-parsed and
// compared against previously emitted entries. We only emit entries that look
// structurally complete — at minimum, `id` and `type` (for nodes) or `id`/`from`/`to`
// (for edges) must be present. To avoid emitting the last entry mid-stream while
// it's still being written, we hold it back until either the next entry appears
// or `finalize()` is called.
export class PartialSchemaScanner {
  private buffer = "";
  private emittedNodes = 0;
  private emittedEdges = 0;
  private programNameEmitted = false;
  private lastScanAt = 0;
  private scannedBufferLen = 0;

  // Minimum ms between scans. jsonrepair + JSON.parse on the full accumulated
  // buffer is O(n) per call; without a time floor we'd run it on every text
  // delta from the model, burning CPU and starving the socket read that's
  // delivering the next chunk.
  private static MIN_SCAN_INTERVAL_MS = 200;

  feed(chunk: string): PartialDelta {
    this.buffer += chunk;
    const now = Date.now();
    if (now - this.lastScanAt < PartialSchemaScanner.MIN_SCAN_INTERVAL_MS) {
      return { newNodes: [], newEdges: [] };
    }
    if (this.buffer.length === this.scannedBufferLen) {
      return { newNodes: [], newEdges: [] };
    }
    this.lastScanAt = now;
    this.scannedBufferLen = this.buffer.length;
    return this.extract(false);
  }

  finalize(): PartialDelta {
    return this.extract(true);
  }

  private extract(isFinal: boolean): PartialDelta {
    const delta: PartialDelta = { newNodes: [], newEdges: [] };

    let partial: unknown;
    try {
      const extracted = extractJson(this.buffer);
      if (!extracted || extracted.length < 2) return delta;
      partial = JSON.parse(jsonrepair(extracted));
    } catch {
      return delta;
    }

    if (!partial || typeof partial !== "object" || Array.isArray(partial)) return delta;
    const obj = partial as Record<string, unknown>;

    if (!this.programNameEmitted && typeof obj.program_name === "string" && obj.program_name.length > 0) {
      delta.programName = obj.program_name;
      this.programNameEmitted = true;
    }

    // Once another top-level key has started, the nodes array is done and the
    // final entry is safe to emit. Same logic for edges vs. triggers/metadata.
    const nodesSealed = isFinal || "edges" in obj || "triggers" in obj || "metadata" in obj;
    const edgesSealed = isFinal || "triggers" in obj || "metadata" in obj || "version_history" in obj;

    if (Array.isArray(obj.nodes)) {
      const limit = nodesSealed ? obj.nodes.length : obj.nodes.length - 1;
      for (let i = this.emittedNodes; i < limit; i++) {
        const raw = obj.nodes[i];
        if (!isNodeComplete(raw)) break;
        delta.newNodes.push(raw as PartialNode);
        this.emittedNodes = i + 1;
      }
    }

    if (Array.isArray(obj.edges)) {
      const limit = edgesSealed ? obj.edges.length : obj.edges.length - 1;
      for (let i = this.emittedEdges; i < limit; i++) {
        const raw = obj.edges[i];
        if (!isEdgeComplete(raw)) break;
        delta.newEdges.push(raw as PartialEdge);
        this.emittedEdges = i + 1;
      }
    }

    return delta;
  }
}

function isNodeComplete(node: unknown): node is PartialNode {
  if (!node || typeof node !== "object") return false;
  const n = node as Record<string, unknown>;
  return typeof n.id === "string" && n.id.length > 0 && typeof n.type === "string" && n.type.length > 0;
}

function isEdgeComplete(edge: unknown): edge is PartialEdge {
  if (!edge || typeof edge !== "object") return false;
  const e = edge as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    e.id.length > 0 &&
    typeof e.from === "string" &&
    e.from.length > 0 &&
    typeof e.to === "string" &&
    e.to.length > 0
  );
}
