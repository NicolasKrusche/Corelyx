import { z } from "zod";

/**
 * Genesis V2 patch-based refinement.
 *
 * The refinement prompt asks the model for a patch — only what changes —
 * instead of regenerating the whole schema. The patch is applied server-side
 * to the trusted existing schema, and the result goes through the exact same
 * normalize/validate pipeline as a full generation, so a malformed patch can
 * never produce a schema a full generation couldn't. Weak models that return
 * a full schema anyway are handled by diffing old vs new (`diffSchemas`), so
 * the client always receives a change summary it can animate.
 */

const PatchNodeZ = z.object({ id: z.string().min(1) }).passthrough();
const PatchEdgeZ = z.object({ id: z.string().min(1) }).passthrough();
const PatchTriggerZ = z.object({ node_id: z.string().min(1) }).passthrough();

export const GenesisPatchZ = z
  .object({
    patch_version: z.union([z.string(), z.number()]).optional(),
    change_summary: z.string().optional(),
    program_name: z.string().optional(),
    execution_mode: z.string().optional(),
    add: z
      .object({
        nodes: z.array(PatchNodeZ).optional(),
        edges: z.array(PatchEdgeZ).optional(),
        triggers: z.array(PatchTriggerZ).optional(),
      })
      .optional(),
    update: z
      .object({
        nodes: z.array(PatchNodeZ).optional(),
        edges: z.array(PatchEdgeZ).optional(),
      })
      .optional(),
    remove: z
      .object({
        node_ids: z.array(z.string()).optional(),
        edge_ids: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .passthrough();

export type GenesisPatch = z.infer<typeof GenesisPatchZ>;

/** Id-level description of what a refinement changed — safe to send to the client. */
export type GenesisPatchSummary = {
  added_node_ids: string[];
  updated_node_ids: string[];
  removed_node_ids: string[];
  added_edge_ids: string[];
  updated_edge_ids: string[];
  removed_edge_ids: string[];
  change_summary: string | null;
};

type LooseNode = { id: string; config?: Record<string, unknown> } & Record<string, unknown>;
type LooseEdge = { id: string } & Record<string, unknown>;
type LooseSchema = {
  nodes?: LooseNode[];
  edges?: LooseEdge[];
  triggers?: Array<{ node_id?: string } & Record<string, unknown>>;
  updated_at?: string;
  program_name?: string;
  execution_mode?: string;
} & Record<string, unknown>;

/**
 * Distinguish a patch response from a full-schema response. A full schema has
 * a top-level nodes array; a patch declares patch_version or add/update/remove.
 */
export function isGenesisPatch(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj.nodes)) return false;
  if (obj.patch_version !== undefined) return true;
  return obj.add !== undefined || obj.update !== undefined || obj.remove !== undefined;
}

function emptySummary(): GenesisPatchSummary {
  return {
    added_node_ids: [],
    updated_node_ids: [],
    removed_node_ids: [],
    added_edge_ids: [],
    updated_edge_ids: [],
    removed_edge_ids: [],
    change_summary: null,
  };
}

/**
 * Apply a Genesis patch to the trusted existing schema. Pure — returns a new
 * object; the caller runs the result through the normal draft/full validation
 * pipeline, which remains the real correctness gate.
 *
 * Semantics kept deliberately simple and prompt-documented:
 * - update entries replace the listed top-level fields; `config`, when
 *   present, replaces the whole config object.
 * - an add whose id already exists is treated as an update (weak-model
 *   leniency); an update whose id does not exist is treated as an add when it
 *   carries a `type`, otherwise dropped.
 * - removing a node also removes edges/triggers referencing it and cleans it
 *   out of any group node's childIds.
 */
export function applyGenesisPatch(
  existingSchema: object,
  patch: GenesisPatch
): { schema: LooseSchema; summary: GenesisPatchSummary } {
  const schema = structuredClone(existingSchema) as LooseSchema;
  const summary = emptySummary();
  summary.change_summary = patch.change_summary?.trim() || null;

  const nodes: LooseNode[] = Array.isArray(schema.nodes) ? schema.nodes : [];
  const edges: LooseEdge[] = Array.isArray(schema.edges) ? schema.edges : [];
  const triggers = Array.isArray(schema.triggers) ? schema.triggers : [];

  // ── Removals first ──
  const removeNodeIds = new Set(patch.remove?.node_ids ?? []);
  const removeEdgeIds = new Set(patch.remove?.edge_ids ?? []);

  let nextNodes = nodes.filter((node) => {
    const removed = removeNodeIds.has(node.id);
    if (removed) summary.removed_node_ids.push(node.id);
    return !removed;
  });
  let nextEdges = edges.filter((edge) => {
    const removed =
      removeEdgeIds.has(edge.id) ||
      removeNodeIds.has(String(edge.from ?? "")) ||
      removeNodeIds.has(String(edge.to ?? ""));
    if (removed) summary.removed_edge_ids.push(edge.id);
    return !removed;
  });
  let nextTriggers = triggers.filter(
    (trigger) => !removeNodeIds.has(String(trigger.node_id ?? ""))
  );

  if (removeNodeIds.size > 0) {
    nextNodes = nextNodes.map((node) => {
      const config = node.config;
      const childIds = config && Array.isArray(config.childIds) ? (config.childIds as string[]) : null;
      if (!childIds || !childIds.some((id) => removeNodeIds.has(id))) return node;
      return {
        ...node,
        config: { ...config, childIds: childIds.filter((id) => !removeNodeIds.has(id)) },
      };
    });
  }

  // ── Updates (and adds that collide → updates) ──
  const applyNodeUpdate = (entry: LooseNode): boolean => {
    const index = nextNodes.findIndex((node) => node.id === entry.id);
    if (index === -1) return false;
    const existing = nextNodes[index]!;
    nextNodes[index] = {
      ...existing,
      ...entry,
      config: entry.config !== undefined ? entry.config : existing.config,
    };
    if (!summary.updated_node_ids.includes(entry.id)) summary.updated_node_ids.push(entry.id);
    return true;
  };

  const applyEdgeUpdate = (entry: LooseEdge): boolean => {
    const index = nextEdges.findIndex((edge) => edge.id === entry.id);
    if (index === -1) return false;
    nextEdges[index] = { ...nextEdges[index]!, ...entry };
    if (!summary.updated_edge_ids.includes(entry.id)) summary.updated_edge_ids.push(entry.id);
    return true;
  };

  for (const entry of patch.update?.nodes ?? []) {
    if (applyNodeUpdate(entry as LooseNode)) continue;
    // Update for a missing id: accept as an add when the entry is a complete
    // node (has a type); otherwise there is nothing safe to do with it.
    if (typeof (entry as LooseNode).type === "string") {
      nextNodes.push(entry as LooseNode);
      summary.added_node_ids.push(entry.id);
    }
  }
  for (const entry of patch.update?.edges ?? []) {
    applyEdgeUpdate(entry as LooseEdge);
  }

  // ── Adds ──
  for (const entry of patch.add?.nodes ?? []) {
    if (applyNodeUpdate(entry as LooseNode)) continue;
    nextNodes.push(entry as LooseNode);
    summary.added_node_ids.push(entry.id);
  }
  for (const entry of patch.add?.edges ?? []) {
    if (applyEdgeUpdate(entry as LooseEdge)) continue;
    nextEdges.push(entry as LooseEdge);
    summary.added_edge_ids.push(entry.id);
  }
  for (const entry of patch.add?.triggers ?? []) {
    const nodeId = String(entry.node_id);
    nextTriggers = nextTriggers.filter((trigger) => String(trigger.node_id ?? "") !== nodeId);
    nextTriggers.push(entry);
  }

  schema.nodes = nextNodes;
  schema.edges = nextEdges;
  schema.triggers = nextTriggers;
  schema.updated_at = new Date().toISOString();
  if (patch.program_name) schema.program_name = patch.program_name;
  if (patch.execution_mode) schema.execution_mode = patch.execution_mode;

  return { schema, summary };
}

/**
 * Compute a patch summary by comparing two full schemas — the fallback for
 * models that ignore the patch instruction and return the whole schema. The
 * UI animates from this exactly as from a real patch application.
 */
export function diffSchemas(before: object, after: object): GenesisPatchSummary {
  const summary = emptySummary();
  const beforeSchema = before as LooseSchema;
  const afterSchema = after as LooseSchema;

  const beforeNodes = new Map(
    (Array.isArray(beforeSchema.nodes) ? beforeSchema.nodes : []).map((n) => [n.id, n])
  );
  const afterNodes = new Map(
    (Array.isArray(afterSchema.nodes) ? afterSchema.nodes : []).map((n) => [n.id, n])
  );
  for (const [id, node] of afterNodes) {
    const previous = beforeNodes.get(id);
    if (!previous) summary.added_node_ids.push(id);
    else if (JSON.stringify(previous) !== JSON.stringify(node)) summary.updated_node_ids.push(id);
  }
  for (const id of beforeNodes.keys()) {
    if (!afterNodes.has(id)) summary.removed_node_ids.push(id);
  }

  const beforeEdges = new Map(
    (Array.isArray(beforeSchema.edges) ? beforeSchema.edges : []).map((e) => [e.id, e])
  );
  const afterEdges = new Map(
    (Array.isArray(afterSchema.edges) ? afterSchema.edges : []).map((e) => [e.id, e])
  );
  for (const [id, edge] of afterEdges) {
    const previous = beforeEdges.get(id);
    if (!previous) summary.added_edge_ids.push(id);
    else if (JSON.stringify(previous) !== JSON.stringify(edge)) summary.updated_edge_ids.push(id);
  }
  for (const id of beforeEdges.keys()) {
    if (!afterEdges.has(id)) summary.removed_edge_ids.push(id);
  }

  return summary;
}

/** True when the summary records no changes at all. */
export function isEmptyPatchSummary(summary: GenesisPatchSummary): boolean {
  return (
    summary.added_node_ids.length === 0 &&
    summary.updated_node_ids.length === 0 &&
    summary.removed_node_ids.length === 0 &&
    summary.added_edge_ids.length === 0 &&
    summary.updated_edge_ids.length === 0 &&
    summary.removed_edge_ids.length === 0
  );
}
