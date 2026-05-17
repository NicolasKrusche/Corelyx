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
      await step.run(`dispatch-${trigger.id}`, async () => {
        // Fetch program schema + user_id
        const { data: program, error: progErr } = await db
          .from("programs")
          .select("id, schema, user_id, workspace_id, execution_mode")
          .eq("id", trigger.program_id)
          .eq("is_active", true)
          .single();

        if (progErr || !program) {
          logger.warn(`Skipping trigger ${trigger.id}: program not found or inactive`);
          return;
        }

        // Check monthly run limit before firing
        const userId = (program as Record<string, unknown>).user_id as string;
        const workspaceId = (program as Record<string, unknown>).workspace_id as string | undefined;
        const restriction = await getProcessingRestriction(userId, db);
        if (restriction.restricted) {
          logger.warn(`Skipping cron trigger ${trigger.id}: processing restricted for user ${userId}`);
          recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "skipped", message: "Processing restricted" });
          return;
        }

        const limitCheck = await checkRunLimit(userId, workspaceId ?? null);
        if (!limitCheck.allowed) {
          logger.warn(`Skipping cron trigger ${trigger.id}: run limit reached for user ${userId}`);
          recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "cron", status: "skipped", message: "Monthly run limit reached" });
          return;
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
          return;
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
            return;
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
          return;
        }

        fired++;
        recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "cron", status: "dispatched" });

        // Update last_fired_at and compute next_run_at
        const expr = (trigger.config as Record<string, unknown>).expression as string;
        const timezone = ((trigger.config as Record<string, unknown>).timezone as string) ?? "UTC";
        let nextRun: string | null = null;
        try {
          const interval = CronExpressionParser.parse(expr, {
            currentDate: new Date(),
            tz: timezone,
          });
          nextRun = interval.next().toISOString();
        } catch {
          logger.warn(`Invalid cron expression for trigger ${trigger.id}: ${expr}`);
        }

        await db
          .from("triggers")
          .update({
            last_fired_at: new Date().toISOString(),
            next_run_at: nextRun,
          } as never)
          .eq("id", trigger.id);
      });
    }

    return { fired };
  }
);
