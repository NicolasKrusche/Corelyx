import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import {
  buildRuntimeExecuteHeaders,
  formatRuntimeRejection,
  readRuntimeRejectionDetails,
  runtimeDispatchConfigError,
} from "@/lib/runtime-dispatch";
import { createServerClient } from "@/lib/supabase/server";
import { validatePreFlight } from "@/lib/validation/pre-flight";
import { checkRunLimit } from "@/lib/limits";
import { sendRunLimitWarningEmail } from "@/lib/email";
import { isNotificationEnabled } from "@/lib/notification-prefs";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { getRuntimeUrl } from "@/lib/runtime-url";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { canRun, canView, getProgramAccess } from "@/lib/workspaces";

/**
 * POST /api/runs/[id]/replay
 *
 * Creates a new run that re-executes the same program as the given run,
 * carrying forward the original trigger_payload. Always uses the current
 * saved program schema (not a snapshot from the original run).
 */
export async function POST(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const { id: originalRunId } = await routeParams;

  const supabase = await createServerClient();
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const processingRestriction = await ensureProcessingAllowed(user.id);
  if (processingRestriction) return processingRestriction;

  const serviceClient = createServiceClient();

  // Fetch the original run
  type OriginalRun = {
    id: string;
    program_id: string;
    status: string;
    trigger_payload: unknown;
  };
  const { data: originalRaw, error: originalError } = await serviceClient
    .from("runs")
    .select("id, program_id, status, trigger_payload")
    .eq("id", originalRunId)
    .single();

  if (originalError || !originalRaw) return apiError("Run not found", 404);
  const original = originalRaw as unknown as OriginalRun;

  // Verify user can run this program
  const access = await getProgramAccess(original.program_id, user.id);
  if (!canView(access)) return apiError("Run not found", 404);
  if (!canRun(access)) return apiError("You do not have permission to replay this run.", 403);

  // Fetch current program schema
  const { data: program, error: progError } = await supabase
    .from("programs")
    .select("id, schema, workspace_id")
    .eq("id", original.program_id)
    .single();

  if (progError || !program) return apiError("Program not found", 404);

  type ProgramRow = { id: string; schema: unknown; workspace_id: string };
  const prog = program as unknown as ProgramRow;
  const programWorkspaceId = prog.workspace_id;

  // Check monthly run limit
  const runLimitCheck = await checkRunLimit(user.id, programWorkspaceId);
  if (!runLimitCheck.allowed) {
    return NextResponse.json(
      { error: "RUN_LIMIT_REACHED", message: runLimitCheck.upgradeMessage },
      { status: 403 }
    );
  }
  if (runLimitCheck.warnAt80Percent && user.email && runLimitCheck.currentCount && runLimitCheck.totalAllowed) {
    void isNotificationEnabled(user.id, "run_limit_warnings").then((enabled) => {
      if (enabled) {
        void sendRunLimitWarningEmail({
          to: user.email!,
          used: runLimitCheck.currentCount!,
          total: runLimitCheck.totalAllowed!,
          tier: "free",
        });
      }
    });
  }

  // Validate schema
  const schema = prog.schema as unknown as ProgramSchema;
  const executableSchema = ProgramSchemaZ.safeParse(schema);
  if (!executableSchema.success) {
    return NextResponse.json(
      {
        error: "WORKFLOW_NOT_RUNNABLE",
        message: "The current workflow schema is not ready to run. Complete the highlighted node settings first.",
        details: executableSchema.error.flatten(),
      },
      { status: 422 }
    );
  }

  // Fetch connections for pre-flight
  const { data: linkedConns } = await serviceClient
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", original.program_id);

  const connectionIds = (linkedConns ?? []).map(
    (r: { connection_id: string }) => r.connection_id
  );

  type ConnectionRow = {
    id: string;
    name: string;
    provider: string;
    scopes: string[] | null;
    is_valid: boolean;
  };
  let connections: ConnectionRow[] = [];
  if (connectionIds.length > 0) {
    const { data } = await serviceClient
      .from("connections")
      .select("id, name, provider, scopes, is_valid")
      .in("id", connectionIds)
      .eq("workspace_id", programWorkspaceId);
    connections = (data ?? []) as ConnectionRow[];
  }

  type ApiKeyRow = { id: string; name: string; provider: string; is_valid: boolean };
  const { data: apiKeysRaw } = await serviceClient
    .from("api_keys")
    .select("id, name, provider, is_valid")
    .eq("workspace_id", programWorkspaceId);
  const apiKeys = (apiKeysRaw ?? []) as ApiKeyRow[];

  const runnableSchema = executableSchema.data as unknown as ProgramSchema;
  const { result, checks } = await validatePreFlight(runnableSchema, connections, apiKeys);
  if (!result.valid) {
    return NextResponse.json({ error: "Pre-flight checks failed", checks }, { status: 422 });
  }

  // Create the new run, carrying forward the original trigger_payload
  const { data: runRaw, error: runError } = await serviceClient
    .from("runs")
    .insert({
      program_id: original.program_id,
      triggered_by: "replay",
      status: "running",
      started_at: new Date().toISOString(),
      trigger_payload: original.trigger_payload ?? null,
    } as unknown as never)
    .select("id")
    .single();

  if (runError || !runRaw) {
    console.error("[/api/runs/replay] insert failed:", runError);
    return apiError(`Failed to create replay run${runError?.message ? `: ${runError.message}` : ""}`, 500);
  }

  const run = runRaw as unknown as { id: string };

  const markFailed = (msg: string) =>
    serviceClient
      .from("runs")
      .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() } as unknown as never)
      .eq("id", run.id);

  // Dispatch to runtime
  const runtimeUrl = getRuntimeUrl();
  try {
    const runtimeBody = JSON.stringify({
      run_id: run.id,
      program_id: original.program_id,
      user_id: user.id,
      schema: runnableSchema,
      triggered_by: "replay",
      trigger_payload: original.trigger_payload ?? null,
      connections: Object.fromEntries(connections.map((c) => [c.name, c.id])),
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
      await markFailed(formatRuntimeRejection(runtimeError));
      return NextResponse.json(
        {
          run_id: run.id,
          status: "failed",
          error: "Runtime failed to accept the replay",
          runtime_status: runtimeError.status,
          message: runtimeError.detail,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    const configError = runtimeDispatchConfigError(error);
    if (configError) {
      await markFailed("Runtime auth is not configured.");
      return configError;
    }
    const message = error instanceof Error ? error.message : "unknown error";
    await markFailed(`Runtime is unreachable (${message})`);
    return NextResponse.json(
      { run_id: run.id, status: "failed", error: "Runtime is unreachable", message },
      { status: 503 }
    );
  }

  return NextResponse.json({
    run_id: run.id,
    program_id: original.program_id,
    status: "running",
  });
}
