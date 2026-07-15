import { createServiceClient } from "@/lib/api";
import { nextFiveFieldCronRun } from "@/lib/cron-expression";

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

/**
 * Serialize with object keys sorted recursively. Postgres jsonb does NOT
 * preserve key order (it canonicalizes keys by length, then bytewise), so a
 * config read back from the DB never stringifies byte-identical to the freshly
 * built object. A plain JSON.stringify comparison therefore reported "changed"
 * on every sync, which rewrote every owned trigger row on every save/page load
 * — and, for cron rows, re-based next_run_at, silently swallowing any due
 * occurrence.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as JsonObject)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function configsEqual(a: JsonObject, b: JsonObject | null): boolean {
  if (!b) return false;
  return stableStringify(a) === stableStringify(b);
}

/**
 * Group rows by their owning node_id (config.node_id), keeping the FIRST row
 * per node — callers must order rows oldest-first — and collecting later
 * duplicates for deletion. Duplicates appear when two syncs race the same
 * first insert (e.g. a page load and an auto-save); without cleanup the stray
 * row is invisible to reconciliation forever — a duplicate cron row
 * double-fires the schedule, and a duplicate webhook row keeps a live public
 * URL that pause/delete never touches.
 */
function collectOwnedRows<T extends { id: string; config: JsonObject | null }>(
  rows: T[]
): { owned: Map<string, T>; strayIds: string[] } {
  const owned = new Map<string, T>();
  const strayIds: string[] = [];
  for (const row of rows) {
    const nodeId = row.config && typeof row.config.node_id === "string" ? row.config.node_id : null;
    if (!nodeId) continue;
    if (owned.has(nodeId)) strayIds.push(row.id);
    else owned.set(nodeId, row);
  }
  return { owned, strayIds };
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
    .eq("type", "event")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load event triggers for sync: ${error.message}`);
  }

  const allRows = (existingRaw ?? []) as unknown as ExistingEventTriggerRow[];
  // Self-heal duplicate owned rows (racing first-inserts) before planning —
  // the planner keys rows by node_id and would silently ignore the strays.
  const { strayIds } = collectOwnedRows(allRows);
  if (strayIds.length > 0) {
    await db.from("triggers").delete().in("id", strayIds);
  }
  const strays = new Set(strayIds);
  const existing = allRows.filter((row) => !strays.has(row.id));
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

// ─── Cron trigger sync ────────────────────────────────────────────────────────

/**
 * Reconcile the `triggers` table so cron trigger nodes in the schema each have
 * a corresponding row. Mirrors the event-trigger sync pattern, keyed by node_id
 * stored inside the config. Safe to call on every schema save and on page load.
 */
export async function syncCronTriggers(
  db: Db,
  programId: string,
  schema: unknown
): Promise<{ inserted: number; updated: number; deleted: number }> {
  if (!isRecord(schema)) return { inserted: 0, updated: 0, deleted: 0 };

  const nodes = Array.isArray(schema.nodes) ? schema.nodes : [];
  const triggerStates = Array.isArray(schema.triggers) ? schema.triggers : [];

  const activeByNode = new Map<string, boolean>();
  for (const state of triggerStates) {
    if (isRecord(state) && typeof state.node_id === "string") {
      activeByNode.set(state.node_id, state.is_active !== false);
    }
  }

  // Collect desired cron trigger rows from schema nodes.
  const desired: Array<{ node_id: string; config: JsonObject; is_active: boolean }> = [];
  for (const node of nodes) {
    if (!isRecord(node) || node.type !== "trigger" || typeof node.id !== "string") continue;
    const cfg = isRecord(node.config) ? node.config : {};
    if (cfg.trigger_type !== "cron") continue;
    const expression = stringField(cfg.expression, "0 9 * * *");
    const timezone = stringField(cfg.timezone, "UTC");
    const scheduleIsValid = computeNextRunAt(expression, timezone) !== null;
    desired.push({
      node_id: node.id,
      config: { trigger_type: "cron", expression, timezone, node_id: node.id },
      // Legacy schemas could contain a non-empty but invalid expression. Keep
      // their runtime projection paused instead of re-enabling it on every
      // reconciliation after the sweep correctly pauses it.
      is_active: scheduleIsValid && (activeByNode.get(node.id) ?? true),
    });
  }

  // Load existing cron rows owned by this program (identified by config.node_id).
  // Fall back to base columns if next_run_at column is absent (pre-migration envs).
  type CronRow = { id: string; config: JsonObject | null; is_active: boolean; next_run_at?: string | null };
  let existing: CronRow[] = [];
  {
    const enriched = await db
      .from("triggers")
      .select("id, config, is_active, next_run_at")
      .eq("program_id", programId)
      .eq("type", "cron")
      .order("created_at", { ascending: true });
    if (!enriched.error) {
      existing = (enriched.data ?? []) as unknown as CronRow[];
    } else {
      const base = await db
        .from("triggers")
        .select("id, config, is_active")
        .eq("program_id", programId)
        .eq("type", "cron")
        .order("created_at", { ascending: true });
      if (base.error) throw new Error(`Failed to load cron triggers for sync: ${base.error.message}`);
      existing = (base.data ?? []) as unknown as CronRow[];
    }
  }

  // Self-heal duplicate owned rows — a stray duplicate cron row double-fires
  // the schedule and is otherwise invisible to this reconciliation.
  const { owned, strayIds } = collectOwnedRows(existing);
  if (strayIds.length > 0) {
    await db.from("triggers").delete().in("id", strayIds);
  }

  let inserted = 0, updated = 0, deleted = 0;

  for (const d of desired) {
    const existing = owned.get(d.node_id);
    const nextRunAt = computeNextRunAt(
      d.config.expression as string,
      d.config.timezone as string
    );

    if (!existing) {
      // Mirror the triggers POST route: only include next_run_at if present
      // so the insert doesn't fail in envs where the column doesn't exist yet.
      const insertPayload: Record<string, unknown> = {
        program_id: programId,
        type: "cron",
        config: d.config,
        is_active: d.is_active,
      };
      if (nextRunAt) insertPayload.next_run_at = nextRunAt;

      const { error: insertError } = await db.from("triggers").insert(insertPayload as never);
      if (!insertError) inserted++;
    } else if (
      !configsEqual(d.config, existing.config) ||
      existing.is_active !== d.is_active ||
      (d.is_active && !existing.next_run_at) ||
      (!d.is_active && existing.next_run_at != null)
    ) {
      // Re-base next_run_at ONLY when the schedule itself changed (or the row
      // has no schedule yet, e.g. on re-enable after a pause). Unrelated config
      // edits must not move an already-due occurrence into the future — that
      // silently skips a fire.
      const existingConfig = existing.config ?? {};
      const scheduleChanged =
        stringField(existingConfig.expression, "") !== d.config.expression ||
        stringField(existingConfig.timezone, "UTC") !== d.config.timezone;

      const updatePayload: Record<string, unknown> = { config: d.config, is_active: d.is_active };
      if (d.is_active && nextRunAt && (scheduleChanged || !existing.next_run_at)) {
        updatePayload.next_run_at = nextRunAt;
      }
      if (!d.is_active && "next_run_at" in existing) updatePayload.next_run_at = null;
      // Cron claims compare updated_at as a schedule-version guard. Keep that
      // version current whenever schema sync changes config/active state.
      if ("next_run_at" in existing) updatePayload.updated_at = new Date().toISOString();

      await db
        .from("triggers")
        .update(updatePayload as never)
        .eq("id", existing.id);
      updated++;
    }
  }

  // Delete rows for cron nodes that no longer exist in the schema.
  const desiredNodeIds = new Set(desired.map((d) => d.node_id));
  for (const [nodeId, row] of owned) {
    if (!desiredNodeIds.has(nodeId)) {
      await db.from("triggers").delete().eq("id", row.id);
      deleted++;
    }
  }

  return { inserted, updated, deleted };
}

function computeNextRunAt(expression: string, timezone: string): string | null {
  return nextFiveFieldCronRun(expression, timezone);
}

// ─── Webhook trigger sync ─────────────────────────────────────────────────────

export interface DesiredWebhookTrigger {
  node_id: string;
  config: JsonObject;
  is_active: boolean;
}

/**
 * Build the set of webhook triggers the schema says should exist. Each editor
 * trigger node of type "webhook" maps to one `triggers` row (keyed by node_id
 * in its config). The row's webhook_token — and therefore its public URL —
 * comes from the DB column default on insert.
 */
export function desiredWebhookTriggersFromSchema(schema: unknown): DesiredWebhookTrigger[] {
  if (!isRecord(schema)) return [];

  const nodes = Array.isArray(schema.nodes) ? schema.nodes : [];
  const triggerStates = Array.isArray(schema.triggers) ? schema.triggers : [];

  const activeByNode = new Map<string, boolean>();
  for (const state of triggerStates) {
    if (isRecord(state) && typeof state.node_id === "string") {
      activeByNode.set(state.node_id, state.is_active !== false);
    }
  }

  const desired: DesiredWebhookTrigger[] = [];
  for (const node of nodes) {
    if (!isRecord(node) || node.type !== "trigger" || typeof node.id !== "string") continue;
    const cfg = isRecord(node.config) ? node.config : {};
    if (cfg.trigger_type !== "webhook") continue;

    const endpointId = typeof cfg.endpoint_id === "string" && cfg.endpoint_id.trim() ? cfg.endpoint_id : null;
    desired.push({
      node_id: node.id,
      config: {
        trigger_type: "webhook",
        method: cfg.method === "GET" ? "GET" : "POST",
        ...(endpointId ? { endpoint_id: endpointId } : {}),
        node_id: node.id,
      },
      is_active: activeByNode.get(node.id) ?? true,
    });
  }
  return desired;
}

/**
 * Reconcile the `triggers` table so webhook trigger nodes in the schema each
 * have a corresponding row. Without this, a webhook trigger node added in the
 * editor (or generated by Genesis / a template) had no row, no webhook_token,
 * and no URL — it could never fire. Entitlements are unaffected: the public
 * webhook endpoint checks trigger access at fire time.
 */
export async function syncWebhookTriggers(
  db: Db,
  programId: string,
  schema: unknown
): Promise<{ inserted: number; updated: number; deleted: number }> {
  const desired = desiredWebhookTriggersFromSchema(schema);

  const { data: existingRaw, error } = await db
    .from("triggers")
    .select("id, config, is_active")
    .eq("program_id", programId)
    .eq("type", "webhook")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Failed to load webhook triggers for sync: ${error.message}`);
  }
  const existing = (existingRaw ?? []) as unknown as ExistingEventTriggerRow[];

  // Only rows carrying a node_id are owned by this sync; rows created on the
  // Triggers page have no node_id and are left untouched. Stray duplicates
  // (racing first-inserts) are deleted — each carries a live public URL that
  // pause/delete would otherwise never touch.
  const { owned, strayIds } = collectOwnedRows(existing);
  if (strayIds.length > 0) {
    await db.from("triggers").delete().in("id", strayIds);
  }

  let inserted = 0,
    updated = 0,
    deleted = 0;

  for (const d of desired) {
    const ex = owned.get(d.node_id);
    if (!ex) {
      const { error: insErr } = await db.from("triggers").insert({
        program_id: programId,
        type: "webhook",
        config: d.config,
        is_active: d.is_active,
      } as never);
      if (!insErr) inserted++;
    } else if (!configsEqual(d.config, ex.config) || ex.is_active !== d.is_active) {
      await db
        .from("triggers")
        .update({ config: d.config, is_active: d.is_active } as never)
        .eq("id", ex.id);
      updated++;
    }
  }

  const desiredNodeIds = new Set(desired.map((d) => d.node_id));
  for (const [nodeId, row] of owned) {
    if (!desiredNodeIds.has(nodeId)) {
      await db.from("triggers").delete().eq("id", row.id);
      deleted++;
    }
  }

  return { inserted, updated, deleted };
}

// ─── File-watch trigger sync ──────────────────────────────────────────────────

const FILE_WATCH_EVENTS = new Set(["created", "modified", "deleted"]);

/**
 * Reconcile the `triggers` table so `file_watch` trigger nodes in the schema each
 * have a corresponding row. Mirrors the event/cron sync pattern, keyed by node_id
 * stored inside the config. A file_watch row's config carries the device + folder
 * + event kinds + name patterns the desktop Bridge needs to watch; the dispatch
 * side reads the same rows to fire matching programs. Safe to call on every save.
 *
 * A watch with no folder configured yet is skipped (and any stale row for that
 * node is removed) — an empty path can't be sandboxed to a grant, so it must not
 * reach the Bridge.
 */
export async function syncFileWatchTriggers(
  db: Db,
  programId: string,
  schema: unknown
): Promise<{ inserted: number; updated: number; deleted: number }> {
  if (!isRecord(schema)) return { inserted: 0, updated: 0, deleted: 0 };

  const nodes = Array.isArray(schema.nodes) ? schema.nodes : [];
  const triggerStates = Array.isArray(schema.triggers) ? schema.triggers : [];

  const activeByNode = new Map<string, boolean>();
  for (const state of triggerStates) {
    if (isRecord(state) && typeof state.node_id === "string") {
      activeByNode.set(state.node_id, state.is_active !== false);
    }
  }

  const desired: Array<{ node_id: string; config: JsonObject; is_active: boolean }> = [];
  for (const node of nodes) {
    if (!isRecord(node) || node.type !== "trigger" || typeof node.id !== "string") continue;
    const cfg = isRecord(node.config) ? node.config : {};
    if (cfg.trigger_type !== "file_watch") continue;

    const path = typeof cfg.path === "string" ? cfg.path.trim() : "";
    if (!path) continue; // no folder yet → nothing safe to watch; leave it unsynced

    const deviceId =
      typeof cfg.device_id === "string" && cfg.device_id.trim() ? cfg.device_id.trim() : null;
    const events = Array.isArray(cfg.events)
      ? cfg.events.filter((e): e is string => typeof e === "string" && FILE_WATCH_EVENTS.has(e))
      : [];
    const patterns = Array.isArray(cfg.patterns)
      ? cfg.patterns.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      : [];

    desired.push({
      node_id: node.id,
      config: {
        trigger_type: "file_watch",
        device_id: deviceId,
        path,
        events: events.length > 0 ? events : ["created", "modified", "deleted"],
        patterns,
        node_id: node.id,
      },
      is_active: activeByNode.get(node.id) ?? true,
    });
  }

  const { data: existingRaw, error } = await db
    .from("triggers")
    .select("id, config, is_active")
    .eq("program_id", programId)
    .eq("type", "file_watch")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Failed to load file_watch triggers for sync: ${error.message}`);
  }
  const existing = (existingRaw ?? []) as unknown as ExistingEventTriggerRow[];

  // Self-heal duplicate owned rows (racing first-inserts) — a stray duplicate
  // watch double-dispatches every matching file event.
  const { owned, strayIds } = collectOwnedRows(existing);
  if (strayIds.length > 0) {
    await db.from("triggers").delete().in("id", strayIds);
  }

  let inserted = 0,
    updated = 0,
    deleted = 0;

  for (const d of desired) {
    const ex = owned.get(d.node_id);
    if (!ex) {
      const { error: insErr } = await db.from("triggers").insert({
        program_id: programId,
        type: "file_watch",
        config: d.config,
        is_active: d.is_active,
      } as never);
      if (!insErr) inserted++;
    } else if (!configsEqual(d.config, ex.config) || ex.is_active !== d.is_active) {
      await db
        .from("triggers")
        .update({ config: d.config, is_active: d.is_active } as never)
        .eq("id", ex.id);
      updated++;
    }
  }

  const desiredNodeIds = new Set(desired.map((d) => d.node_id));
  for (const [nodeId, row] of owned) {
    if (!desiredNodeIds.has(nodeId)) {
      await db.from("triggers").delete().eq("id", row.id);
      deleted++;
    }
  }

  return { inserted, updated, deleted };
}
