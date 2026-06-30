import { NonRetriableError, cron } from "inngest";
import { CronExpressionParser } from "cron-parser"; // fix: cron-parser v5 exports CronExpressionParser, not parseExpression
import { inngest } from "@/lib/inngest";
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

/**
 * Inngest function: runs every minute, finds all active cron triggers that are
 * due to fire, dispatches a run for each, then updates next_run_at.
 */
export const cronRunner = inngest.createFunction(
  { id: "cron-runner", name: "Cron Trigger Runner", triggers: cron("* * * * *") },
  async ({ step, logger }) => {
    const db = createServiceClient();

    // ── 1. Find all due cron triggers ──────────────────────────────────────
    const due = await step.run("fetch-due-triggers", async () => {
      const { data, error } = await db
        .from("triggers")
        .select("id, program_id, config")
        .eq("type", "cron")
        .eq("is_active", true)
        .lte("next_run_at", new Date().toISOString());

      if (error) throw new NonRetriableError(`DB error: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        program_id: string;
        config: Record<string, unknown>;
      }>;
    });

    if (due.length === 0) return { fired: 0 };

    // ── 2. For each due trigger, dispatch a run ────────────────────────────
    const runtimeUrl = getRuntimeUrl();

    let fired = 0;

    for (const trigger of due) {
      // Accumulate the durable per-trigger result OUTSIDE the step. Mutating an
      // outer counter inside step.run is lost on Inngest replay (the callback is
      // skipped and its memoized value returned), so the count must come back as
      // the step's return value.
      const didFire = await step.run(`dispatch-${trigger.id}`, async (): Promise<boolean> => {
        // Fetch program schema + user_id
        const { data: program, error: progErr } = await db
          .from("programs")
          .select("id, schema, user_id, workspace_id, execution_mode, program_type, name, description")
          .eq("id", trigger.program_id)
          .eq("is_active", true)
          .single();

        if (progErr || !program) {
          logger.warn(`Skipping trigger ${trigger.id}: program not found or inactive`);
          // Advance so a trigger pointing at a missing/inactive program isn't
          // re-checked every minute; it resumes on schedule if reactivated.
          await advanceNextRun(db, trigger, logger);
          return false;
        }

        // Check monthly run limit before firing
        const userId = (program as Record<string, unknown>).user_id as string;
        const workspaceId = (program as Record<string, unknown>).workspace_id as string | undefined;
        const restriction = await getProcessingRestriction(userId, db);
        if (restriction.restricted) {
          logger.warn(`Skipping cron trigger ${trigger.id}: processing restricted for user ${userId}`);
          recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "skipped", message: "Processing restricted" });
          // Advance to the next scheduled time so the trigger resumes on
          // schedule once the hold lifts, instead of re-checking every minute.
          await advanceNextRun(db, trigger, logger);
          return false;
        }

        const limitCheck = await checkRunLimit(userId, workspaceId ?? null);
        if (!limitCheck.allowed) {
          logger.warn(`Skipping cron trigger ${trigger.id}: run limit reached for user ${userId}`);
          recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "skipped", message: "Monthly run limit reached" });
          // Advance to the next scheduled time so the trigger resumes on
          // schedule once the limit resets, instead of re-checking every minute.
          await advanceNextRun(db, trigger, logger);
          return false;
        }

        // Standing agent: each scheduled fire spawns a fresh one-time agent
        // (clone + reason from scratch + prior-run memory), then advances next_run_at.
        if ((program as Record<string, unknown>).program_type === "agent") {
          const fireResult = await fireAgentTrigger(
            db as Parameters<typeof fireAgentTrigger>[0],
            program as unknown as Parameters<typeof fireAgentTrigger>[1],
            "agent_cron",
            { trigger_id: trigger.id }
          );
          if (fireResult.ok) {
            logger.info(`Cron trigger ${trigger.id} fired (agent program ${trigger.program_id}) → run ${fireResult.runId}`);
            recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId: fireResult.runId, source: "cron", status: "dispatched" });
          } else {
            logger.error(`Cron agent fire failed for trigger ${trigger.id}: ${fireResult.error}`);
            recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "failed", message: fireResult.error });
          }
          await advanceNextRun(db, trigger, logger);
          return fireResult.ok;
        }

        // Insert run row
        const { data: run, error: runErr } = await db
          .from("runs")
          .insert({
            program_id: trigger.program_id,
            triggered_by: "cron",
            trigger_payload: { trigger_id: trigger.id },
            status: "running",
            started_at: new Date().toISOString(),
            execution_mode: (program as Record<string, unknown>).execution_mode ?? "autonomous",
          } as never)
          .select("id")
          .single();

        if (runErr || !run) {
          logger.error(`Failed to create run for trigger ${trigger.id}`);
          // Transient insert failure: don't advance, so it retries next tick.
          return false;
        }

        // Fetch program's connection name→id map so runtime can resolve connector nodes
        const { data: linkedConnsRaw } = await db
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

        // Dispatch to Python runtime
        const runId = (run as { id: string }).id;
        try {
          const runtimeBody = JSON.stringify({
            run_id: runId,
            program_id: trigger.program_id,
            user_id: (program as Record<string, unknown>).user_id,
            schema: (program as Record<string, unknown>).schema,
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
            await db
              .from("runs")
              .update({ status: "failed", error_message: formatRuntimeRejection(runtimeError), completed_at: new Date().toISOString() } as never)
              .eq("id", runId);
            recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "cron", status: "failed", message: formatRuntimeRejection(runtimeError) });
            // The trigger fired (a run was created) — stamp last_fired_at and
            // advance next_run_at even though dispatch failed, so the trigger
            // doesn't re-fire every minute and the UI reflects the firing.
            await advanceNextRun(db, trigger, logger);
            return false;
          }
        } catch (error) {
          const authMisconfigured = isRuntimeDispatchConfigError(error);
          logger.error(authMisconfigured ? `Runtime auth misconfigured for cron run ${runId}` : `Runtime unreachable for cron run ${runId}`);
          const errMsg = authMisconfigured ? "Runtime auth is not configured." : "Runtime is unreachable";
          await db
            .from("runs")
            .update({
              status: "failed",
              error_message: errMsg,
              completed_at: new Date().toISOString(),
            } as never)
            .eq("id", runId);
          recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "cron", status: "failed", message: errMsg });
          // The trigger fired (a run was created) — stamp last_fired_at and
          // advance next_run_at even though dispatch failed, so the trigger
          // doesn't re-fire every minute and the UI reflects the firing.
          await advanceNextRun(db, trigger, logger);
          return false;
        }

        logger.info(`Cron trigger ${trigger.id} fired (program ${trigger.program_id}) → run ${runId}`);
        recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "cron", status: "dispatched" });

        await advanceNextRun(db, trigger, logger);
        return true;
      });
      if (didFire) fired++;
    }

    return { fired };
  }
);

/** Stamp last_fired_at and compute the next_run_at from the cron expression. */
async function advanceNextRun(
  db: ReturnType<typeof createServiceClient>,
  trigger: { id: string; config: Record<string, unknown> },
  logger: { warn: (msg: string) => void }
): Promise<void> {
  const expr = trigger.config.expression as string;
  const timezone = (trigger.config.timezone as string) ?? "UTC";
  let nextRun: string | null = null;
  try {
    nextRun = CronExpressionParser.parse(expr, { currentDate: new Date(), tz: timezone })
      .next()
      .toISOString();
  } catch {
    logger.warn(`Invalid cron expression for trigger ${trigger.id}: ${expr}`);
  }
  await db
    .from("triggers")
    .update({ last_fired_at: new Date().toISOString(), next_run_at: nextRun } as never)
    .eq("id", trigger.id);
}
