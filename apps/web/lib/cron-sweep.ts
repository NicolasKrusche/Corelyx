import { createServiceClient } from "@/lib/api";
import { nextFiveFieldCronRun } from "@/lib/cron-expression";
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
   dispatch: the UPDATE advances next_run_at only when the schedule version,
   active state, and due time still match what this sweep read. Exactly one
   scheduler wins the claim; the loser sees zero updated rows and skips.

   This is deliberately at-most-once dispatch, not a transactional queue: a
   process crash after the claim and before runtime acceptance can miss that
   occurrence. Keeping the claim-to-dispatch section bounded minimizes that
   window while preventing duplicate external side effects. */

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
  next_run_at: string | null;
  updated_at: string | null;
};

type ClaimResult = "claimed" | "initialized" | "invalid" | "lost" | "error";

// Catch-up window: a missed occurrence still fires if it is at most this old.
// Anything older (e.g. weeks of scheduler downtime) advances to the next
// scheduled time WITHOUT firing, so a deploy never sets off a burst of
// long-stale workflows.
const CATCH_UP_WINDOW_MS = 24 * 60 * 60 * 1000;

// Keep one serverless invocation comfortably inside the route's 60s limit.
// Any rows beyond this batch remain due and are picked up by the next tick.
export const CRON_SWEEP_BATCH_SIZE = 25;
const CRON_SWEEP_TIME_BUDGET_MS = 45_000;
const RUNTIME_DISPATCH_TIMEOUT_MS = 15_000;
const CRON_SWEEP_COMPLETION_RESERVE_MS = RUNTIME_DISPATCH_TIMEOUT_MS + 3_000;

/** Next occurrence of a cron expression, or null when the expression is invalid. */
export function computeNextRun(
  expression: unknown,
  timezone: unknown,
  from: Date = new Date()
): string | null {
  return nextFiveFieldCronRun(expression, timezone, from);
}

/**
 * Atomically initialize or claim a trigger by advancing next_run_at, but only
 * if its active state, due time, and updated_at version still match what this
 * sweep read. last_fired_at is deliberately written only after dispatch is
 * accepted by the runtime/agent path.
 */
async function claimTrigger(
  db: ReturnType<typeof createServiceClient>,
  trigger: DueTrigger,
  logger: Logger
): Promise<ClaimResult> {
  const nextRun = computeNextRun(trigger.config.expression, trigger.config.timezone);
  const claimedAt = new Date().toISOString();
  const patch = nextRun
    ? { next_run_at: nextRun, updated_at: claimedAt }
    : { is_active: false, next_run_at: null, updated_at: claimedAt };

  let query = (db as any)
    .from("triggers")
    .update(patch)
    .eq("id", trigger.id)
    .eq("type", "cron")
    .eq("is_active", true);

  query = trigger.next_run_at === null
    ? query.is("next_run_at", null)
    : query.eq("next_run_at", trigger.next_run_at);
  query = trigger.updated_at === null
    ? query.is("updated_at", null)
    : query.eq("updated_at", trigger.updated_at);

  const { data, error } = await query.select("id");
  if (error) {
    logger.error(`Failed to claim trigger ${trigger.id}: ${error.message}`);
    return "error";
  }
  if ((data ?? []).length === 0) return "lost";

  if (!nextRun) {
    logger.warn(
      `Paused cron trigger ${trigger.id}: invalid expression ${String(trigger.config.expression)}`
    );
    return "invalid";
  }
  return trigger.next_run_at === null ? "initialized" : "claimed";
}

async function markTriggerFired(
  db: ReturnType<typeof createServiceClient>,
  triggerId: string,
  logger: Logger
): Promise<void> {
  try {
    const { error } = await (db as any)
      .from("triggers")
      .update({ last_fired_at: new Date().toISOString() })
      .eq("id", triggerId)
      .eq("type", "cron");
    if (error) logger.warn(`Cron trigger ${triggerId} fired, but last_fired_at could not be saved: ${error.message}`);
  } catch (error) {
    logger.warn(
      `Cron trigger ${triggerId} fired, but last_fired_at could not be saved: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

/**
 * Fire every due cron trigger once. Safe to call concurrently from multiple
 * schedulers — the per-trigger claim guarantees single dispatch.
 */
export async function sweepDueCronTriggers(logger: Logger = console): Promise<CronSweepResult> {
  const db = createServiceClient();
  const result: CronSweepResult = { checked: 0, fired: 0, skipped: 0, failed: 0 };
  const deadline = Date.now() + CRON_SWEEP_TIME_BUDGET_MS;
  const now = new Date().toISOString();

  const { data: dueRaw, error: dueError } = await (db as any)
    .from("triggers")
    .select("id, program_id, config, next_run_at, updated_at")
    .eq("type", "cron")
    .eq("is_active", true)
    .or(`next_run_at.is.null,next_run_at.lte.${now}`)
    // Serve real due occurrences before using remaining batch capacity to
    // repair dormant null schedules.
    .order("next_run_at", { ascending: true, nullsFirst: false })
    .limit(CRON_SWEEP_BATCH_SIZE);

  if (dueError) throw new Error(`Cron sweep DB error: ${dueError.message}`);

  const due = (dueRaw ?? []) as DueTrigger[];
  result.checked = due.length;
  if (due.length === 0) return result;

  const runtimeUrl = getRuntimeUrl();

  for (let index = 0; index < due.length; index++) {
    const trigger = due[index]!;
    // Do not claim another occurrence unless enough invocation time remains
    // for the worst-case runtime timeout plus final DB/event writes.
    if (Date.now() >= deadline - CRON_SWEEP_COMPLETION_RESERVE_MS) {
      logger.warn(`Cron sweep time budget reached; deferring ${due.length - index} trigger(s) to the next tick`);
      break;
    }

    // Claim first (advances next_run_at) so a concurrent scheduler can never
    // double-fire this occurrence, and a crash mid-dispatch skips at most one
    // firing instead of re-firing every tick.
    const claim = await claimTrigger(db, trigger, logger);
    if (claim === "lost") {
      result.skipped++;
      continue;
    }
    if (claim === "error") {
      result.failed++;
      continue;
    }
    if (claim === "initialized") {
      logger.info(`Initialized next run for cron trigger ${trigger.id}`);
      result.skipped++;
      continue;
    }
    if (claim === "invalid") {
      await recordTriggerEvent({
        triggerId: trigger.id,
        programId: trigger.program_id,
        source: "cron",
        status: "failed",
        message: "Invalid cron expression; trigger was paused",
      });
      result.failed++;
      continue;
    }

    // Too stale to fire: the occurrence was missed by more than the catch-up
    // window. The claim above already advanced next_run_at, so the trigger
    // simply resumes on its normal schedule.
    const overdueMs = Date.now() - new Date(trigger.next_run_at!).getTime();
    if (overdueMs > CATCH_UP_WINDOW_MS) {
      logger.warn(
        `Skipping cron trigger ${trigger.id}: missed occurrence is ${Math.round(overdueMs / 3_600_000)}h old — resuming on schedule`
      );
      await recordTriggerEvent({
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
      await recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "skipped", message: "Workflow not found" });
      result.skipped++;
      continue;
    }

    const userId = program.user_id as string;
    const workspaceId = program.workspace_id as string | undefined;

    const restriction = await getProcessingRestriction(userId, db);
    if (restriction.restricted) {
      logger.warn(`Skipping cron trigger ${trigger.id}: processing restricted for user ${userId}`);
      await recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "skipped", message: "Processing restricted" });
      result.skipped++;
      continue;
    }

    const limitCheck = await checkRunLimit(userId, workspaceId ?? null);
    if (!limitCheck.allowed) {
      logger.warn(`Skipping cron trigger ${trigger.id}: run limit reached for user ${userId}`);
      await recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "skipped", message: "Monthly run limit reached" });
      result.skipped++;
      continue;
    }

    // Standing agent: each scheduled fire spawns a fresh one-time agent.
    if (program.program_type === "agent") {
      const fireResult = await fireAgentTrigger(
        db as Parameters<typeof fireAgentTrigger>[0],
        program as Parameters<typeof fireAgentTrigger>[1],
        "agent_cron",
        { trigger_id: trigger.id },
        { dispatchTimeoutMs: RUNTIME_DISPATCH_TIMEOUT_MS }
      );
      if (fireResult.ok) {
        logger.info(`Cron trigger ${trigger.id} fired (agent program ${trigger.program_id}) → run ${fireResult.runId}`);
        await markTriggerFired(db, trigger.id, logger);
        await recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId: fireResult.runId, source: "cron", status: "dispatched" });
        result.fired++;
      } else {
        logger.error(`Cron agent fire failed for trigger ${trigger.id}: ${fireResult.error}`);
        await recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "failed", message: fireResult.error });
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
      await recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "failed", message: "Run row could not be created" });
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
        signal: AbortSignal.timeout(RUNTIME_DISPATCH_TIMEOUT_MS),
      });
      if (!runtimeRes.ok) {
        const runtimeError = await readRuntimeRejectionDetails(runtimeRes);
        logger.error(`Runtime rejected cron run ${runId} (${runtimeError.status}): ${runtimeError.detail}`);
        await (db as any)
          .from("runs")
          .update({ status: "failed", error_message: formatRuntimeRejection(runtimeError), completed_at: new Date().toISOString() })
          .eq("id", runId);
        await recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "cron", status: "failed", message: formatRuntimeRejection(runtimeError) });
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
      await recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "cron", status: "failed", message: errMsg });
      result.failed++;
      continue;
    }

    logger.info(`Cron trigger ${trigger.id} fired (program ${trigger.program_id}) → run ${runId}`);
    await markTriggerFired(db, trigger.id, logger);
    await recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "cron", status: "dispatched" });
    result.fired++;
  }

  return result;
}
