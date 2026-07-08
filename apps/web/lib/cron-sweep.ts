import { CronExpressionParser } from "cron-parser";
import { createServiceClient } from "@/lib/api";
import { checkRunLimit } from "@/lib/limits";
import { getProcessingRestriction } from "@/lib/compliance";
import { getRuntimeUrl } from "@/lib/runtime-url";
import {
  buildRuntimeExecuteHeaders,
  formatRuntimeRejection,
  isRuntimeDispatchConfigError,
  readRuntimeRejectionDetails,
} from "@/lib/runtime-dispatch";
import { recordTriggerEvent } from "@/lib/trigger-events";
import { fireAgentTrigger } from "@/lib/agents/dispatch";

/* The cron sweep: find every active cron trigger whose next_run_at is due,
   fire it once, and advance next_run_at to the next scheduled occurrence.

   Invoked from two schedulers so triggers fire even if one path is down:
     1. The Python runtime's 60s heartbeat → POST /api/internal/cron/tick
        (always-on Railway service — the primary path).
     2. The Inngest cron-runner function (when Inngest is configured).

   Both may tick concurrently, so each trigger is CLAIMED atomically before
   dispatch: the UPDATE advances next_run_at only when it still equals the
   value this sweep read. Exactly one scheduler wins; the loser sees zero
   updated rows and skips. */

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

export type CronSweepResult = {
  checked: number;
  fired: number;
  skipped: number;
  failed: number;
};

type DueTrigger = {
  id: string;
  program_id: string;
  config: Record<string, unknown>;
  next_run_at: string;
};

// Catch-up window: a missed occurrence still fires if it is at most this old.
// Anything older (e.g. weeks of scheduler downtime) advances to the next
// scheduled time WITHOUT firing, so a deploy never sets off a burst of
// long-stale workflows.
const CATCH_UP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Next occurrence of a cron expression, or null when the expression is invalid. */
export function computeNextRun(
  expression: unknown,
  timezone: unknown,
  from: Date = new Date()
): string | null {
  if (typeof expression !== "string" || !expression.trim()) return null;
  const tz = typeof timezone === "string" && timezone.trim() ? timezone : "UTC";
  try {
    return CronExpressionParser.parse(expression, { currentDate: from, tz })
      .next()
      .toISOString();
  } catch {
    return null;
  }
}

/**
 * Atomically claim a due trigger: stamp last_fired_at and advance next_run_at,
 * but only if next_run_at still holds the value we read. Returns false when
 * another scheduler already claimed this occurrence.
 */
async function claimTrigger(
  db: ReturnType<typeof createServiceClient>,
  trigger: DueTrigger,
  logger: Logger
): Promise<boolean> {
  const nextRun = computeNextRun(trigger.config.expression, trigger.config.timezone);
  if (!nextRun) {
    logger.warn(
      `Invalid cron expression for trigger ${trigger.id}: ${String(trigger.config.expression)} — trigger goes dormant until re-saved`
    );
  }
  const { data, error } = await (db as any)
    .from("triggers")
    .update({ last_fired_at: new Date().toISOString(), next_run_at: nextRun })
    .eq("id", trigger.id)
    .eq("next_run_at", trigger.next_run_at)
    .select("id");
  if (error) {
    logger.error(`Failed to claim trigger ${trigger.id}: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Fire every due cron trigger once. Safe to call concurrently from multiple
 * schedulers — the per-trigger claim guarantees single dispatch.
 */
export async function sweepDueCronTriggers(logger: Logger = console): Promise<CronSweepResult> {
  const db = createServiceClient();
  const result: CronSweepResult = { checked: 0, fired: 0, skipped: 0, failed: 0 };

  const { data: dueRaw, error: dueError } = await (db as any)
    .from("triggers")
    .select("id, program_id, config, next_run_at")
    .eq("type", "cron")
    .eq("is_active", true)
    .lte("next_run_at", new Date().toISOString());

  if (dueError) throw new Error(`Cron sweep DB error: ${dueError.message}`);

  const due = (dueRaw ?? []) as DueTrigger[];
  result.checked = due.length;
  if (due.length === 0) return result;

  const runtimeUrl = getRuntimeUrl();

  for (const trigger of due) {
    // Claim first (advances next_run_at) so a concurrent scheduler can never
    // double-fire this occurrence, and a crash mid-dispatch skips at most one
    // firing instead of re-firing every tick.
    if (!(await claimTrigger(db, trigger, logger))) {
      result.skipped++;
      continue;
    }

    // Too stale to fire: the occurrence was missed by more than the catch-up
    // window. The claim above already advanced next_run_at, so the trigger
    // simply resumes on its normal schedule.
    const overdueMs = Date.now() - new Date(trigger.next_run_at).getTime();
    if (overdueMs > CATCH_UP_WINDOW_MS) {
      logger.warn(
        `Skipping cron trigger ${trigger.id}: missed occurrence is ${Math.round(overdueMs / 3_600_000)}h old — resuming on schedule`
      );
      recordTriggerEvent({
        triggerId: trigger.id,
        programId: trigger.program_id,
        source: "cron",
        status: "skipped",
        message: "Missed occurrence was too old to fire; resuming on schedule",
      });
      result.skipped++;
      continue;
    }

    // The trigger's own is_active (checked above) is the source of truth for
    // whether this schedule runs — program.is_active is not a second gate.
    const { data: program, error: progErr } = await (db as any)
      .from("programs")
      .select("id, schema, user_id, workspace_id, execution_mode, program_type, name, description")
      .eq("id", trigger.program_id)
      .single();

    if (progErr || !program) {
      logger.warn(`Skipping trigger ${trigger.id}: program not found`);
      result.skipped++;
      continue;
    }

    const userId = program.user_id as string;
    const workspaceId = program.workspace_id as string | undefined;

    const restriction = await getProcessingRestriction(userId, db);
    if (restriction.restricted) {
      logger.warn(`Skipping cron trigger ${trigger.id}: processing restricted for user ${userId}`);
      recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "skipped", message: "Processing restricted" });
      result.skipped++;
      continue;
    }

    const limitCheck = await checkRunLimit(userId, workspaceId ?? null);
    if (!limitCheck.allowed) {
      logger.warn(`Skipping cron trigger ${trigger.id}: run limit reached for user ${userId}`);
      recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "skipped", message: "Monthly run limit reached" });
      result.skipped++;
      continue;
    }

    // Standing agent: each scheduled fire spawns a fresh one-time agent.
    if (program.program_type === "agent") {
      const fireResult = await fireAgentTrigger(
        db as Parameters<typeof fireAgentTrigger>[0],
        program as Parameters<typeof fireAgentTrigger>[1],
        "agent_cron",
        { trigger_id: trigger.id }
      );
      if (fireResult.ok) {
        logger.info(`Cron trigger ${trigger.id} fired (agent program ${trigger.program_id}) → run ${fireResult.runId}`);
        recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId: fireResult.runId, source: "cron", status: "dispatched" });
        result.fired++;
      } else {
        logger.error(`Cron agent fire failed for trigger ${trigger.id}: ${fireResult.error}`);
        recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "failed", message: fireResult.error });
        result.failed++;
      }
      continue;
    }

    // Workflow program: create the run row, then dispatch to the runtime.
    const { data: run, error: runErr } = await (db as any)
      .from("runs")
      .insert({
        program_id: trigger.program_id,
        triggered_by: "cron",
        trigger_payload: { trigger_id: trigger.id },
        status: "running",
        started_at: new Date().toISOString(),
        execution_mode: program.execution_mode ?? "autonomous",
      })
      .select("id")
      .single();

    if (runErr || !run) {
      logger.error(`Failed to create run for trigger ${trigger.id}: ${runErr?.message ?? "no row"}`);
      recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "failed", message: "Run row could not be created" });
      result.failed++;
      continue;
    }
    const runId = (run as { id: string }).id;

    // Connection name→id map so the runtime can resolve connector nodes.
    const { data: linkedConnsRaw } = await (db as any)
      .from("program_connections")
      .select("connection_id, connections(id, name, provider)")
      .eq("program_id", trigger.program_id);

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

    try {
      const runtimeBody = JSON.stringify({
        run_id: runId,
        program_id: trigger.program_id,
        user_id: userId,
        schema: program.schema,
        triggered_by: "cron",
        trigger_payload: { trigger_id: trigger.id },
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
        logger.error(`Runtime rejected cron run ${runId} (${runtimeError.status}): ${runtimeError.detail}`);
        await (db as any)
          .from("runs")
          .update({ status: "failed", error_message: formatRuntimeRejection(runtimeError), completed_at: new Date().toISOString() })
          .eq("id", runId);
        recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "cron", status: "failed", message: formatRuntimeRejection(runtimeError) });
        result.failed++;
        continue;
      }
    } catch (error) {
      const authMisconfigured = isRuntimeDispatchConfigError(error);
      logger.error(authMisconfigured ? `Runtime auth misconfigured for cron run ${runId}` : `Runtime unreachable for cron run ${runId}`);
      const errMsg = authMisconfigured ? "Runtime auth is not configured." : "Runtime is unreachable";
      await (db as any)
        .from("runs")
        .update({ status: "failed", error_message: errMsg, completed_at: new Date().toISOString() })
        .eq("id", runId);
      recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "cron", status: "failed", message: errMsg });
      result.failed++;
      continue;
    }

    logger.info(`Cron trigger ${trigger.id} fired (program ${trigger.program_id}) → run ${runId}`);
    recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "cron", status: "dispatched" });
    result.fired++;
  }

  return result;
}
