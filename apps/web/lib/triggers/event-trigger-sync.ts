import { createServiceClient } from "@/lib/api";

type Db = ReturnType<typeof createServiceClient>;

type JsonObject = Record<string, unknown>;

export interface DesiredEventTrigger {
  node_id: string;
  config: JsonObject;
  is_active: boolean;
}

export interface ExistingEventTriggerRow {
  id: string;
  config: JsonObject | null;
  is_active: boolean;
}

export interface EventTriggerSyncPlan {
  toInsert: DesiredEventTrigger[];
  toUpdate: Array<{ id: string; config: JsonObject; is_active: boolean }>;
  toDelete: string[];
}

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

/**
 * Build the set of event triggers the schema says should exist. Each editor
 * trigger node of type "event" maps to one `triggers` row, keyed by the node id
 * so it can be reconciled on subsequent saves. `source`/`event`/`filter` come
 * from the node's config; `is_active` comes from the schema's per-node trigger
 * state (defaults to active).
 */
export function desiredEventTriggersFromSchema(schema: unknown): DesiredEventTrigger[] {
  if (!isRecord(schema)) return [];

  const nodes = Array.isArray(schema.nodes) ? schema.nodes : [];
  const triggerStates = Array.isArray(schema.triggers) ? schema.triggers : [];

  const activeByNode = new Map<string, boolean>();
  for (const state of triggerStates) {
    if (isRecord(state) && typeof state.node_id === "string") {
      activeByNode.set(state.node_id, state.is_active !== false);
    }
  }

  const desired: DesiredEventTrigger[] = [];
  for (const node of nodes) {
    if (!isRecord(node) || node.type !== "trigger" || typeof node.id !== "string") continue;
    const config = isRecord(node.config) ? node.config : {};
    if (config.trigger_type !== "event") continue;

    desired.push({
      node_id: node.id,
      config: {
        trigger_type: "event",
        source: stringField(config.source, "unknown"),
        event: stringField(config.event, "trigger"),
        filter: isRecord(config.filter) ? config.filter : null,
        node_id: node.id,
      },
      is_active: activeByNode.get(node.id) ?? true,
    });
  }
  return desired;
}

function configsEqual(a: JsonObject, b: JsonObject | null): boolean {
  if (!b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Diff the schema's desired event triggers against the rows already in the
 * `triggers` table. Only rows this sync owns (those carrying a `node_id` in
 * their config) are ever updated or deleted, so triggers created by other means
 * are left untouched.
 */
export function planEventTriggerSync(
  schema: unknown,
  existingRows: ExistingEventTriggerRow[]
): EventTriggerSyncPlan {
  const desired = desiredEventTriggersFromSchema(schema);
  const desiredByNode = new Map(desired.map((d) => [d.node_id, d]));

  const owned = new Map<string, ExistingEventTriggerRow>();
  for (const row of existingRows) {
    const nodeId = row.config && typeof row.config.node_id === "string" ? row.config.node_id : null;
    if (nodeId) owned.set(nodeId, row);
  }

  const toInsert: DesiredEventTrigger[] = [];
  const toUpdate: EventTriggerSyncPlan["toUpdate"] = [];
  for (const d of desired) {
    const existing = owned.get(d.node_id);
    if (!existing) {
      toInsert.push(d);
      continue;
    }
    if (!configsEqual(d.config, existing.config) || existing.is_active !== d.is_active) {
      toUpdate.push({ id: existing.id, config: d.config, is_active: d.is_active });
    }
  }

  const toDelete: string[] = [];
  for (const [nodeId, row] of owned) {
    if (!desiredByNode.has(nodeId)) toDelete.push(row.id);
  }

  return { toInsert, toUpdate, toDelete };
}

/**
 * Reconcile the `triggers` table so the program's event triggers match its
 * saved schema. Returns a counts summary for logging.
 */
export async function syncEventTriggers(
  db: Db,
  programId: string,
  schema: unknown
): Promise<{ inserted: number; updated: number; deleted: number }> {
  const { data: existingRaw, error } = await db
    .from("triggers")
    .select("id, config, is_active")
    .eq("program_id", programId)
    .eq("type", "event");

  if (error) {
    throw new Error(`Failed to load event triggers for sync: ${error.message}`);
  }

  const existing = (existingRaw ?? []) as unknown as ExistingEventTriggerRow[];
  const plan = planEventTriggerSync(schema, existing);

  if (plan.toInsert.length > 0) {
    await db.from("triggers").insert(
      plan.toInsert.map((d) => ({
        program_id: programId,
        type: "event",
        config: d.config,
        is_active: d.is_active,
      })) as never
    );
  }

  for (const update of plan.toUpdate) {
    await db
      .from("triggers")
      .update({ config: update.config, is_active: update.is_active } as never)
      .eq("id", update.id);
  }

  if (plan.toDelete.length > 0) {
    await db.from("triggers").delete().in("id", plan.toDelete);
  }

  return {
    inserted: plan.toInsert.length,
    updated: plan.toUpdate.length,
    deleted: plan.toDelete.length,
  };
}
