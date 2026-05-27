import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { serverLog } from "@/lib/server-log";
import {
  buildRuntimeExecuteHeaders,
  formatRuntimeRejection,
  readRuntimeRejectionDetails,
  runtimeDispatchConfigError,
} from "@/lib/runtime-dispatch";
import { createServerClient } from "@/lib/supabase/server";
import { validatePreFlight } from "@/lib/validation/pre-flight";
import { checkRunLimit, getRunHistoryDays } from "@/lib/limits";
import { sendRunLimitWarningEmail } from "@/lib/email";
import { isNotificationEnabled } from "@/lib/notification-prefs";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { getRuntimeUrl } from "@/lib/runtime-url";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { canRun, canView, getActiveWorkspace, getProgramAccess } from "@/lib/workspaces";
import { resolveWorkspaceEnvVars } from "@/lib/env-vars";
import { loadWorkspaceComplianceSettings } from "@/lib/compliance/server";
import {
  hasBlockingComplianceChecks,
  validateWorkflowCompliance,
} from "@/lib/compliance/workflow";

// POST /api/runs — create a run and dispatch to runtime
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const processingRestriction = await ensureProcessingAllowed(user.id);
  if (processingRestriction) return processingRestriction;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.program_id !== "string") {
    return apiError("Missing program_id", 400);
  }
  const { program_id } = body as { program_id: string };

  const access = await getProgramAccess(program_id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canRun(access)) return apiError("You do not have permission to run this program.", 403);

  const { data: program, error: progError } = await supabase
    .from("programs")
    .select("id, schema, user_id, workspace_id, schema_version")
    .eq("id", program_id)
    .single();

  if (progError || !program) return apiError("Program not found", 404);

  // Check monthly run limit
  const programWorkspaceId = (program as unknown as { workspace_id: string }).workspace_id;
  const runLimitCheck = await checkRunLimit(user.id, programWorkspaceId);
  if (!runLimitCheck.allowed) {
    return NextResponse.json(
      { error: "RUN_LIMIT_REACHED", message: runLimitCheck.upgradeMessage },
      { status: 403 }
    );
  }
  // Fire 80% warning email in background (non-blocking)
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

  type ProgramRow = { id: string; schema: unknown; user_id: string; schema_version: number | null };
  const prog = program as unknown as ProgramRow;
  const schema = prog.schema as unknown as ProgramSchema;
  const executableSchema = ProgramSchemaZ.safeParse(schema);
  if (!executableSchema.success) {
    return NextResponse.json(
      {
        error: "WORKFLOW_NOT_RUNNABLE",
        message: "This workflow is saved as a draft but is not ready to run. Complete the highlighted node settings first.",
        details: executableSchema.error.flatten(),
      },
      { status: 422 }
    );
  }

  // Run PRE_004 sentinel check using service client for key/connection lookups
  const serviceClient = createServiceClient();

  const { data: linkedConns } = await serviceClient
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", program_id);

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

  const workspaceCompliance = await loadWorkspaceComplianceSettings(programWorkspaceId, serviceClient);
  const complianceChecks = validateWorkflowCompliance(
    runnableSchema,
    workspaceCompliance,
    { connections, apiKeys }
  );
  if (hasBlockingComplianceChecks(complianceChecks)) {
    return NextResponse.json(
      {
        error: "Compliance checks failed",
        message: "This workflow cannot run until blocked compliance checks are resolved.",
        compliance_checks: complianceChecks,
      },
      { status: 422 }
    );
  }

  const retentionExpiry = new Date(
    Date.now() + workspaceCompliance.execution_log_retention_days * 24 * 60 * 60 * 1000
  ).toISOString();

  // fix: select only id to tolerate envs where migration 20240006 (telemetry columns) not yet applied
  const { data: runRaw, error: runError } = await serviceClient
    .from("runs")
    .insert({
      program_id,
      user_id: user.id,
      workflow_version: prog.schema_version ?? null,
      triggered_by: "manual",
      trigger_source: "manual",
      status: "running",
      started_at: new Date().toISOString(),
      data_region: workspaceCompliance.data_region,
      policy_checks: complianceChecks,
      block_warning_reasons: complianceChecks
        .filter((check) => check.status !== "passed")
        .map((check) => ({ id: check.id, status: check.status, message: check.message })),
      retention_expiry: retentionExpiry,
    } as unknown as never)
    .select("id")
    .single();

  if (runError || !runRaw) {
    serverLog({ level: "error", event: "runs.create.insert_failed", message: "Run row insert failed." });
    return apiError(`Failed to create run${runError?.message ? `: ${runError.message}` : ""}`, 500);
  }

  const run = runRaw as unknown as { id: string };

  // Dispatch to Python runtime — if it rejects or is unreachable, fail the run immediately
  const runtimeUrl = getRuntimeUrl();

  const markFailed = (msg: string) =>
    serviceClient
      .from("runs")
      .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() } as unknown as never)
      .eq("id", run.id);

  try {
    const envVars = await resolveWorkspaceEnvVars(programWorkspaceId);
    const runtimeBody = JSON.stringify({
      run_id: run.id,
      program_id,
      user_id: user.id,
      schema: runnableSchema,
      triggered_by: "manual",
      connections: Object.fromEntries(connections.map((c) => [c.name, c.id])),
      env_vars: envVars,
      compliance_mode: workspaceCompliance.compliance_mode,
      data_region: workspaceCompliance.data_region,
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
          error: "Runtime failed to accept the run",
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
    await markFailed(`Runtime is unreachable — is the runtime service running? (${message})`);
    return NextResponse.json(
      { run_id: run.id, status: "failed", error: "Runtime is unreachable", message },
      { status: 503 }
    );
  }

  return NextResponse.json({ run_id: run.id, status: "running" });
}

// GET /api/runs?program_id=X — list runs for a program
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const program_id = searchParams.get("program_id");
  if (!program_id) return apiError("Missing program_id", 400);

  const access = await getProgramAccess(program_id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const serviceClient = createServiceClient();
  const ws = await getActiveWorkspace(user.id);
  const historyDays = await getRunHistoryDays(user.id, ws?.workspaceId ?? null);
  const historyWindowStart = historyDays !== null
    ? new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  type RunRow = {
    id: string;
    status: string;
    triggered_by: string;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    connector_api_calls: number;
    model_call_count: number;
    created_at: string;
  };

  let runsQuery = serviceClient
    .from("runs")
    .select("id, status, triggered_by, started_at, completed_at, error_message, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, connector_api_calls, model_call_count, created_at")
    .eq("program_id", program_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (historyWindowStart) {
    runsQuery = runsQuery.gte("started_at", historyWindowStart);
  }

  const { data: runsRaw, error: runsError } = await runsQuery;

  if (runsError) return apiError(runsError.message, 500);

  const runs = (runsRaw ?? []) as unknown as RunRow[];
  return NextResponse.json({ runs });
}
