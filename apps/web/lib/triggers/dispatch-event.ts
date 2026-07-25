import { createServiceClient } from "@/lib/api";
import { checkRunLimit, checkTriggerAccess } from "@/lib/limits";
import { fireAgentTrigger } from "@/lib/agents/dispatch";
import { getProcessingRestriction } from "@/lib/compliance";
import { getRuntimeUrl } from "@/lib/runtime-url";
import {
  buildRuntimeExecuteHeaders,
  formatRuntimeRejection,
  isRuntimeDispatchConfigError,
  readRuntimeRejectionDetails,
} from "@/lib/runtime-dispatch";

type JsonObject = Record<string, unknown>;

type TriggerRow = {
  id: string;
  program_id: string;
  config: JsonObject;
  is_active: boolean;
};

export type ProgramRow = {
  id: string;
  schema: unknown;
  user_id: string;
  workspace_id: string;
  execution_mode: string;
  is_active: boolean;
  conflict_policy: string | null;
  program_type: string | null;
  name: string;
  description: string | null;
};

export interface DispatchEventInput {
  source: string;
  event: string;
  payload?: JsonObject;
  connection_id?: string;
  user_id?: string;
  triggered_by?: string;
}

export interface DispatchEventResult {
  matched: number;
  fired: number;
  runs: string[];
}

export class InvalidEventPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEventPayloadError";
  }
}

function _nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeEventPayload(
  source: string,
  event: string,
  payload: JsonObject,
): JsonObject {
  if (source !== "gmail" || event !== "message.received") return payload;

  const messageId = _nonEmptyString(payload.message_id)
    ?? (Array.isArray(payload.message_ids)
      ? payload.message_ids.map(_nonEmptyString).find(Boolean) ?? null
      : null);

  if (!messageId) {
    throw new InvalidEventPayloadError(
      "Gmail message.received events require a message_id before dispatch."
    );
  }

  return payload.message_id === messageId ? payload : { ...payload, message_id: messageId };
}

export function eventNamesMatch(
  source: string,
  configuredEvent: unknown,
  receivedEvent: string,
): boolean {
  if (configuredEvent === receivedEvent) return true;
  return source === "gmail"
    && configuredEvent === "new_email"
    && receivedEvent === "message.received";
}

export function buildEventTriggerPayload({
  triggerId,
  source,
  event,
  payload,
  connectionId,
}: {
  triggerId: string;
  source: string;
  event: string;
  payload: JsonObject;
  connectionId?: string;
}): JsonObject {
  return {
    ...payload,
    trigger_id: triggerId,
    source,
    event,
    payload,
    connection_id: connectionId ?? null,
  };
}

export async function dispatchEventTriggers(
  input: DispatchEventInput
): Promise<DispatchEventResult> {
  const db = createServiceClient();
  const payload = normalizeEventPayload(input.source, input.event, input.payload ?? {});

  // Filter by source server-side (config->>source) and paginate: an unfiltered
  // scan truncates at PostgREST's 1000-row default once there are that many
  // active event triggers platform-wide, so an arbitrary subset of users' event
  // workflows silently stops firing. Narrowing to this source and ranging through
  // every page guarantees nothing is dropped.
  const PAGE_SIZE = 1000;
  const triggers: TriggerRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: pageRaw, error: trigErr } = await db
      .from("triggers")
      .select("id, program_id, config, is_active")
      .eq("type", "event")
      .eq("is_active", true)
      .eq("config->>source", input.source)
      .range(from, from + PAGE_SIZE - 1);

    if (trigErr) {
      throw new Error(`Failed to load event triggers: ${trigErr.message}`);
    }
    const page = (pageRaw ?? []) as unknown as TriggerRow[];
    triggers.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  const matching = triggers.filter((trigger) => {
    const cfg = trigger.config ?? {};
    if (cfg.source !== input.source || !eventNamesMatch(input.source, cfg.event, input.event)) {
      return false;
    }

    const filter = cfg.filter;
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      return true;
    }

    const candidate = {
      ...payload,
      source: input.source,
      event: input.event,
      connection_id: input.connection_id ?? null,
      user_id: input.user_id ?? null,
      payload,
    };
    return _matchesFilter(filter, candidate);
  });

  if (matching.length === 0) {
    return { matched: 0, fired: 0, runs: [] };
  }

  let allowedProgramIds: Set<string> | null = null;
  if (input.connection_id) {
    const { data: links } = await db
      .from("program_connections")
      .select("program_id")
      .eq("connection_id", input.connection_id);

    allowedProgramIds = new Set(
      ((links ?? []) as Array<{ program_id: string }>).map((row) => row.program_id)
    );
  }

  const runIds: string[] = [];

  await Promise.all(
    matching.map(async (trigger) => {
      const { data: programRaw } = await db
        .from("programs")
        .select("id, schema, user_id, workspace_id, execution_mode, is_active, conflict_policy, program_type, name, description")
        .eq("id", trigger.program_id)
        .single();

      if (!programRaw) return;
      const program = programRaw as unknown as ProgramRow;
      if (!program.is_active) return;

      if (input.user_id && program.user_id !== input.user_id) return;
      if (allowedProgramIds && !allowedProgramIds.has(program.id)) return;

      const restriction = await getProcessingRestriction(program.user_id, db);
      if (restriction.restricted) return;

      const triggerAccessCheck = await checkTriggerAccess(program.user_id, "event", program.workspace_id);
      if (!triggerAccessCheck.allowed) return;

      const runLimitCheck = await checkRunLimit(program.user_id, program.workspace_id);
      if (!runLimitCheck.allowed) return;

      const triggeredBy = input.triggered_by ?? `event:${input.source}:${input.event}`;
      const triggerPayload = buildEventTriggerPayload({
        triggerId: trigger.id,
        source: input.source,
        event: input.event,
        payload,
        connectionId: input.connection_id,
      });

      const runId = await fireTriggeredProgram({
        db,
        program,
        triggerId: trigger.id,
        triggeredBy,
        triggerPayload,
        agentTriggerKind: "agent_event",
      });
      if (runId) runIds.push(runId);
    })
  );

  return { matched: matching.length, fired: runIds.length, runs: runIds };
}

function _matchesFilter(filter: unknown, candidate: unknown): boolean {
  if (
    typeof filter !== "object" ||
    filter === null ||
    typeof candidate !== "object" ||
    candidate === null
  ) {
    return filter === candidate;
  }

  if (Array.isArray(filter)) {
    if (!Array.isArray(candidate) || filter.length !== candidate.length) return false;
    return filter.every((item, index) => _matchesFilter(item, candidate[index]));
  }

  const filterObj = filter as Record<string, unknown>;
  const candidateObj = candidate as Record<string, unknown>;
  return Object.entries(filterObj).every(([key, value]) =>
    _matchesFilter(value, candidateObj[key])
  );
}

/**
 * Fire one program in response to a matched trigger: spawn a fresh agent (agent
 * programs) or create a run and dispatch it to the runtime (workflows). Stamps
 * the trigger's last_fired_at. Returns the run id once a run/agent row exists, or
 * null when nothing started (conflict slot taken, run-insert failed).
 *
 * Shared by the event dispatcher and the file_watch dispatcher so both firing
 * paths stay byte-for-byte identical. Callers own their access/limit gates and
 * build the trigger payload before calling.
 */
export async function fireTriggeredProgram(opts: {
  db: ReturnType<typeof createServiceClient>;
  program: ProgramRow;
  triggerId: string;
  triggeredBy: string;
  triggerPayload: JsonObject;
  agentTriggerKind: string;
}): Promise<string | null> {
  const { db, program, triggerId, triggeredBy, triggerPayload, agentTriggerKind } = opts;

  // Standing agent: each match spawns a fresh one-time agent (clone + reason from
  // scratch + prior-run memory). No conflict slot — the clone is brand new.
  if (program.program_type === "agent") {
    const fired = await fireAgentTrigger(
      db as Parameters<typeof fireAgentTrigger>[0],
      program,
      agentTriggerKind,
      triggerPayload
    );
    await db
      .from("triggers")
      .update({ last_fired_at: new Date().toISOString() } as never)
      .eq("id", triggerId);
    return fired.ok ? fired.runId : null;
  }

  const conflict = await _checkAndAcquireSlot(db, program.id, program.conflict_policy);
  if (!conflict.allowed) return null;

  const { data: runRaw } = await db
    .from("runs")
    .insert({
      program_id: program.id,
      triggered_by: triggeredBy,
      trigger_payload: triggerPayload,
      status: "running",
      started_at: new Date().toISOString(),
      execution_mode: program.execution_mode,
    } as never)
    .select("id")
    .single();

  if (!runRaw) return null;
  const run = runRaw as unknown as { id: string };

  await db
    .from("triggers")
    .update({ last_fired_at: new Date().toISOString() } as never)
    .eq("id", triggerId);

  // Fetch the program's linked connections to give the runtime a name→id map,
  // so connection nodes can resolve their name references to UUIDs at execution time.
  const { data: linkedConnsRaw } = await db
    .from("program_connections")
    .select("connection_id, connections(id, name, provider)")
    .eq("program_id", program.id);

  const connectionNameToId: Record<string, string> = {};
  for (const row of (linkedConnsRaw ?? []) as Array<{
    connection_id: string;
    connections: { id: string; name: string; provider: string } | null;
  }>) {
    if (row.connections) {
      connectionNameToId[row.connections.name] = row.connections.id;
      connectionNameToId[`${row.connections.provider}:primary`] = row.connections.id;
    }
  }

  const runtimeUrl = getRuntimeUrl();
  try {
    const runtimeBody = JSON.stringify({
      run_id: run.id,
      program_id: program.id,
      user_id: program.user_id,
      schema: program.schema,
      triggered_by: triggeredBy,
      trigger_payload: triggerPayload,
      connections: connectionNameToId,
    });
    const runtimeHeaders = buildRuntimeExecuteHeaders(runtimeBody);
    const runtimeRes = await fetch(`${runtimeUrl}/execute`, {
      method: "POST",
      headers: runtimeHeaders,
      body: runtimeBody,
      cache: "no-store",
    });
    if (!runtimeRes.ok) {
      const runtimeError = await readRuntimeRejectionDetails(runtimeRes);
      await db
        .from("runs")
        .update({ status: "failed", error_message: formatRuntimeRejection(runtimeError), completed_at: new Date().toISOString() } as never)
        .eq("id", run.id);
    }
  } catch (error) {
    await db
      .from("runs")
      .update({
        status: "failed",
        error_message: isRuntimeDispatchConfigError(error)
          ? "Runtime auth is not configured."
          : "Runtime is unreachable",
        completed_at: new Date().toISOString(),
      } as never)
      .eq("id", run.id);
  }

  return run.id;
}

async function _checkAndAcquireSlot(
  db: ReturnType<typeof createServiceClient>,
  programId: string,
  conflictPolicy: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: running } = await db
    .from("runs")
    .select("id")
    .eq("program_id", programId)
    .in("status", ["running", "paused"])
    .limit(1);

  if (!running || running.length === 0) return { allowed: true };

  const policy = conflictPolicy ?? "queue";
  if (policy === "skip") {
    return { allowed: false, reason: "skip policy: another run is active" };
  }
  if (policy === "fail") {
    return { allowed: false, reason: "fail policy: another run is active" };
  }
  return { allowed: true };
}
