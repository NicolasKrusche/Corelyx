import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { sendRunFailureEmail } from "@/lib/email";
import { isNotificationEnabled } from "@/lib/notification-prefs";
import { requestHasValidInternalServiceToken } from "@/lib/internal-auth";
import { getRuntimeUrl } from "@/lib/runtime-url";
import {
  buildRuntimeExecuteHeaders,
  formatRuntimeRejection,
  isRuntimeDispatchConfigError,
  readRuntimeRejectionDetails,
} from "@/lib/runtime-dispatch";
import { getProcessingRestriction } from "@/lib/compliance";
import { recordTriggerEvent } from "@/lib/trigger-events";

/**
 * POST /api/internal/runs/[id]/complete
 *
 * Called by the Python runtime when a run finishes (success or failure).
 * Handles:
 *   1. Releasing resource locks for the run
 *   2. Checking for inter-program triggers (downstream programs)
 *   3. Firing downstream runs
 *
 * Secured by a scoped internal service token.
 */
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const rawBody = await request.text();
  if (
    !requestHasValidInternalServiceToken(request.headers, "next:runs:complete", {
      method: "POST",
      path: new URL(request.url).pathname,
      body: rawBody,
    })
  ) {
    return apiError("Unauthorized", 401);
  }

  let body: unknown = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const { program_id, user_id, status = "completed", error_message, triggered_by } = body as {
    program_id: string;
    user_id: string;
    status?: string;
    error_message?: string;
    triggered_by?: string;
  };

  if (!program_id || !user_id) {
    return apiError("Missing program_id or user_id", 400);
  }

  const db = createServiceClient();

  // ── 1. Release resource locks ──────────────────────────────────────────────
  await db
    .from("resource_locks")
    .delete()
    .eq("locked_by_run_id", params.id);

  // ── 1b. Send failure email ─────────────────────────────────────────────────
  if (status === "failed") {
    try {
      const [{ data: userData }, { data: programData }] = await Promise.all([
        db.auth.admin.getUserById(user_id),
        db.from("programs").select("name").eq("id", program_id).single(),
      ]);
      const email = userData?.user?.email;
      const programName = (programData as { name?: string } | null)?.name ?? "Unknown program";
      if (email && await isNotificationEnabled(user_id, "run_failures")) {
        await sendRunFailureEmail({
          to: email,
          programName,
          runId: params.id,
          programId: program_id,
          errorMessage: error_message,
          triggeredBy: triggered_by,
        });
      }
    } catch (err) {
      console.error("[complete] Failed to send failure email:", err);
    }
  }

  // ── 2. Find downstream program triggers ───────────────────────────────────
  if (status === "completed") {
    const { data: downstreamTriggers } = await db
      .from("triggers")
      .select("id, program_id, config")
      .eq("type", "program")
      .eq("is_active", true);

    if (downstreamTriggers && downstreamTriggers.length > 0) {
      type TriggerRow = { id: string; program_id: string; config: Record<string, unknown> };
      const matching = (downstreamTriggers as unknown as TriggerRow[]).filter(
        (t) => t.config.source_program_id === program_id
      );

      if (matching.length > 0) {
        const runtimeUrl = getRuntimeUrl();

        for (const trigger of matching) {
          // Fetch downstream program schema
          const { data: downProgram } = await db
            .from("programs")
            .select("id, schema, user_id, execution_mode, is_active, conflict_policy")
            .eq("id", trigger.program_id)
            .eq("is_active", true)
            .single();

          if (!downProgram) continue;

          type DownProgramRow = {
            id: string;
            schema: unknown;
            user_id: string;
            execution_mode: string;
            conflict_policy: string;
          };
          const prog = downProgram as unknown as DownProgramRow;

          const restriction = await getProcessingRestriction(prog.user_id, db);
          if (restriction.restricted) continue;

          // Check conflict policy
          const { data: activeRuns } = await db
            .from("runs")
            .select("id")
            .eq("program_id", trigger.program_id)
            .in("status", ["running", "paused"])
            .limit(1);

          if (activeRuns && activeRuns.length > 0) {
            if (prog.conflict_policy === "skip" || prog.conflict_policy === "fail") {
              recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "program", status: "skipped", message: `Conflict policy: ${prog.conflict_policy}` });
              continue; // Skip or fail — don't fire downstream
            }
            // queue: proceed (runtime will queue)
          }

          // Fetch connection name→id map for this downstream program
          const { data: linkedConnsRaw } = await db
            .from("program_connections")
            .select("connection_id, connections(id, name)")
            .eq("program_id", trigger.program_id);

          const connectionNameToId: Record<string, string> = {};
          for (const row of (linkedConnsRaw ?? []) as Array<{
            connection_id: string;
            connections: { id: string; name: string } | null;
          }>) {
            if (row.connections) connectionNameToId[row.connections.name] = row.connections.id;
          }

          const downstreamTriggerPayload = {
            trigger_id: trigger.id,
            source_program_id: program_id,
            source_run_id: params.id,
          };

          // Create downstream run
          const { data: downRun } = await db
            .from("runs")
            .insert({
              program_id: trigger.program_id,
              triggered_by: "program",
              trigger_payload: downstreamTriggerPayload,
              status: "running",
              started_at: new Date().toISOString(),
              execution_mode: prog.execution_mode,
            } as never)
            .select("id")
            .single();

          if (!downRun) continue;

          const runId = (downRun as unknown as { id: string }).id;

          // Dispatch to runtime
          try {
            const runtimeBody = JSON.stringify({
              run_id: runId,
              program_id: trigger.program_id,
              user_id: prog.user_id,
              schema: prog.schema,
              triggered_by: "program",
              trigger_payload: downstreamTriggerPayload,
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
                .eq("id", runId);
              continue;
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
              .eq("id", runId);
            continue;
          }

          // Update trigger last_fired_at
          await db
            .from("triggers")
            .update({ last_fired_at: new Date().toISOString() } as never)
            .eq("id", trigger.id);

          recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId, source: "program", status: "dispatched" });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
