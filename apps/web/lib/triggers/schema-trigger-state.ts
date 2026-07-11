type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function schemaTriggerNodeId(config: unknown): string | null {
  if (!isRecord(config)) return null;
  return typeof config.node_id === "string" && config.node_id.trim()
    ? config.node_id.trim()
    : null;
}

/**
 * Return a new canonical workflow schema with one trigger's active state
 * changed. The linked trigger node must still exist; otherwise the DB row is
 * stale and callers should refuse the mutation instead of inventing a schema
 * state for a missing node.
 */
export function withSchemaTriggerActiveState(
  schema: unknown,
  nodeId: string,
  isActive: boolean,
  nextScheduled: string | null,
  updatedAt: string = new Date().toISOString()
): JsonObject | null {
  if (!isRecord(schema)) return null;
  const nodes = Array.isArray(schema.nodes) ? schema.nodes : [];
  const node = nodes.find(
    (candidate) => isRecord(candidate) && candidate.id === nodeId && candidate.type === "trigger"
  );
  if (!isRecord(node)) return null;

  const nodeConfig = isRecord(node.config) ? node.config : {};
  const triggerType =
    typeof nodeConfig.trigger_type === "string" ? nodeConfig.trigger_type : "manual";
  const states = Array.isArray(schema.triggers) ? schema.triggers : [];
  let found = false;
  const nextStates = states.map((state) => {
    if (!isRecord(state) || state.node_id !== nodeId) return state;
    found = true;
    return {
      ...state,
      node_id: nodeId,
      type: triggerType,
      is_active: isActive,
      next_scheduled: nextScheduled,
    };
  });

  if (!found) {
    nextStates.push({
      node_id: nodeId,
      type: triggerType,
      is_active: isActive,
      last_fired: null,
      next_scheduled: nextScheduled,
    });
  }

  return { ...schema, triggers: nextStates, updated_at: updatedAt };
}
