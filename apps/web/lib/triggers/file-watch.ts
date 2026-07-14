import { createServiceClient } from "@/lib/api";
import { getProcessingRestriction } from "@/lib/compliance";
import { checkLocalFilesAccess, checkRunLimit } from "@/lib/limits";
import { fireTriggeredProgram, type ProgramRow } from "@/lib/triggers/dispatch-event";
import type { DeviceRow } from "@/lib/devices";

/**
 * Server-side brain for `file_watch` triggers.
 *
 * The desktop Bridge owns the actual filesystem watching; the cloud never sees a
 * path until the Bridge reports a change. This module answers two questions for
 * the Bridge's device-token endpoints:
 *
 *   1. "What should I watch?" — `watchesForDevice` returns the active file_watch
 *      configs targeting this device (explicitly, or as the workspace's default
 *      device when a watch leaves device_id null).
 *   2. "A file changed — fire it." — `dispatchFileWatchEvent` re-validates the
 *      reported change against the trigger config (device ownership, event kind,
 *      name pattern, entitlement, limits) and fires the program. The web stays the
 *      authority: a buggy/compromised Bridge can only fire triggers that target
 *      its own device.
 */

export type FileWatchEvent = "created" | "modified" | "deleted";

const ALL_EVENTS: FileWatchEvent[] = ["created", "modified", "deleted"];

export interface BridgeWatch {
  trigger_id: string;
  path: string;
  events: FileWatchEvent[];
  patterns: string[];
}

type AnyDb = { from(table: string): any };

function asEvents(value: unknown): FileWatchEvent[] {
  if (!Array.isArray(value)) return [...ALL_EVENTS];
  const filtered = value.filter(
    (e): e is FileWatchEvent => typeof e === "string" && (ALL_EVENTS as string[]).includes(e)
  );
  return filtered.length > 0 ? filtered : [...ALL_EVENTS];
}

function asPatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

/**
 * Translate a simple filename glob (`*`, `?`, character classes) into a RegExp and
 * test it against a basename. Patterns are matched against the file name only, not
 * the full path. Case-insensitive (matches typical desktop filesystem behaviour).
 */
export function matchesAnyPattern(patterns: string[], name: string): boolean {
  if (patterns.length === 0) return true; // no patterns → any file
  return patterns.some((pattern) => globToRegExp(pattern).test(name));
}

function globToRegExp(glob: string): RegExp {
  let out = "";
  for (const ch of glob) {
    if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else if ("\\^$.|+()[]{}".includes(ch)) out += `\\${ch}`;
    else out += ch;
  }
  return new RegExp(`^${out}$`, "i");
}

/**
 * The workspace's default device for watches that don't name one: the most
 * recently seen, non-revoked device. Mirrors the runtime's resolve_default_device
 * so only one device acts on a null-device watch (no double-watching).
 *
 * Mobile devices (ios/android) are EXCLUDED: only the desktop Bridge can execute
 * file operations / watch folders, and a phone — which phones home often — would
 * otherwise become "most recently seen" and silently hijack file-op routing to a
 * device that can't run it. Keep this filter in lockstep with the runtime's
 * resolve_default_device (apps/runtime/db.py).
 */
export async function resolveDefaultDeviceId(
  db: AnyDb,
  workspaceId: string
): Promise<string | null> {
  const { data } = await db
    .from("devices")
    .select("id")
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    // Allowlist (not a denylist) so an unknown future platform fails SAFE — never
    // routed a file op — matching the runtime's _FILE_OP_CAPABLE_PLATFORMS.
    .in("platform", ["macos", "windows", "linux", "unknown"])
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Active file_watch configs this device should be watching. */
export async function watchesForDevice(
  db: AnyDb,
  device: Pick<DeviceRow, "id" | "workspace_id">
): Promise<BridgeWatch[]> {
  const { data: rows } = await db
    .from("triggers")
    .select("id, config, programs!inner(workspace_id, is_active)")
    .eq("type", "file_watch")
    .eq("is_active", true)
    .eq("programs.workspace_id", device.workspace_id)
    .eq("programs.is_active", true);

  const defaultDeviceId = await resolveDefaultDeviceId(db, device.workspace_id);

  const watches: BridgeWatch[] = [];
  for (const row of (rows as Array<{ id: string; config: Record<string, unknown> | null }>) ?? []) {
    const cfg = row.config ?? {};
    const target = typeof cfg.device_id === "string" && cfg.device_id ? cfg.device_id : null;
    const mine = target ? target === device.id : device.id === defaultDeviceId;
    if (!mine) continue;
    const path = typeof cfg.path === "string" ? cfg.path : "";
    if (!path) continue;
    watches.push({
      trigger_id: row.id,
      path,
      events: asEvents(cfg.events),
      patterns: asPatterns(cfg.patterns),
    });
  }
  return watches;
}

export interface FileWatchEventInput {
  device: DeviceRow;
  triggerId: string;
  event: FileWatchEvent;
  /** Absolute path of the changed file, as the Bridge saw it. */
  path: string;
  /** Basename of the changed file (patterns match against this). */
  name: string;
  isDir?: boolean;
}

export interface FileWatchDispatchResult {
  fired: boolean;
  runId: string | null;
  /** Why a change did not fire, for the Bridge's debug log (never surfaced raw). */
  reason?: string;
}

/**
 * Re-validate a Bridge-reported file change against its trigger and, if it still
 * matches, fire the program. All gates are re-checked server-side; the Bridge's
 * local match is treated as a hint, never as authority.
 */
export async function dispatchFileWatchEvent(
  input: FileWatchEventInput
): Promise<FileWatchDispatchResult> {
  const db = createServiceClient();
  const anyDb = db as unknown as AnyDb;

  const { data: trigRaw } = await anyDb
    .from("triggers")
    .select("id, program_id, type, config, is_active")
    .eq("id", input.triggerId)
    .maybeSingle();

  const trig = trigRaw as
    | { id: string; program_id: string; type: string; config: Record<string, unknown> | null; is_active: boolean }
    | null;
  if (!trig) return { fired: false, runId: null, reason: "trigger_not_found" };
  if (trig.type !== "file_watch" || !trig.is_active) {
    return { fired: false, runId: null, reason: "trigger_inactive" };
  }

  const cfg = trig.config ?? {};

  // Device ownership — the device may only fire watches that target it.
  const target = typeof cfg.device_id === "string" && cfg.device_id ? cfg.device_id : null;
  if (target) {
    if (target !== input.device.id) return { fired: false, runId: null, reason: "device_mismatch" };
  } else {
    const defaultId = await resolveDefaultDeviceId(anyDb, input.device.workspace_id);
    if (defaultId !== input.device.id) {
      return { fired: false, runId: null, reason: "not_default_device" };
    }
  }

  // Event kind + name pattern filters.
  if (!asEvents(cfg.events).includes(input.event)) {
    return { fired: false, runId: null, reason: "event_filtered" };
  }
  if (!matchesAnyPattern(asPatterns(cfg.patterns), input.name)) {
    return { fired: false, runId: null, reason: "pattern_filtered" };
  }

  const { data: progRaw } = await anyDb
    .from("programs")
    .select(
      "id, schema, user_id, workspace_id, execution_mode, is_active, conflict_policy, program_type, name, description"
    )
    .eq("id", trig.program_id)
    .single();

  const program = progRaw as unknown as ProgramRow | null;
  if (!program) return { fired: false, runId: null, reason: "program_missing" };
  if (!program.is_active) return { fired: false, runId: null, reason: "program_inactive" };
  // Defence in depth: the trigger's program must live in the device's workspace.
  if (program.workspace_id !== input.device.workspace_id) {
    return { fired: false, runId: null, reason: "workspace_mismatch" };
  }

  const restriction = await getProcessingRestriction(program.user_id, db);
  if (restriction.restricted) return { fired: false, runId: null, reason: "processing_restricted" };

  const access = await checkLocalFilesAccess(program.user_id, program.workspace_id);
  if (!access.allowed) return { fired: false, runId: null, reason: "entitlement" };

  const runLimit = await checkRunLimit(program.user_id, program.workspace_id);
  if (!runLimit.allowed) return { fired: false, runId: null, reason: "run_limit" };

  const triggerPayload = {
    trigger_id: trig.id,
    source: "file",
    event: `file.${input.event}`,
    path: input.path,
    name: input.name,
    is_dir: input.isDir ?? false,
    device_id: input.device.id,
  };

  const runId = await fireTriggeredProgram({
    db,
    program,
    triggerId: trig.id,
    triggeredBy: `file_watch:${input.event}`,
    triggerPayload,
    agentTriggerKind: "agent_file_watch",
  });

  return { fired: runId !== null, runId };
}
