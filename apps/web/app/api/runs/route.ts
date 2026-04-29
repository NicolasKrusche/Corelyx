import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { buildInternalServiceHeaders } from "@/lib/internal-auth";
import { createServerClient } from "@/lib/supabase/server";
import { validatePreFlight } from "@/lib/validation/pre-flight";
import { checkRunLimit, getRunHistoryDays } from "@/lib/limits";
import { sendRunLimitWarningEmail } from "@/lib/email";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";

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

  // Fetch program schema + verify ownership
  const { data: program, error: progError } = await supabase
    .from("programs")
    .select("id, schema, user_id")
    .eq("id", program_id)
    .eq("user_id", user.id)
    .single();

  if (progError || !program) return apiError("Program not found", 404);

  // Check monthly run limit
  const runLimitCheck = await checkRunLimit(user.id);
  if (!runLimitCheck.allowed) {
    return NextResponse.json(
      { error: "RUN_LIMIT_REACHED", message: runLimitCheck.upgradeMessage },
      { status: 403 }
    );
  }
  // Fire 80% warning email in background (non-blocking)
  if (runLimitCheck.warnAt80Percent && user.email && runLimitCheck.currentCount && runLimitCheck.totalAllowed) {
    void sendRunLimitWarningEmail({
      to: user.email,
      used: runLimitCheck.currentCount,
      total: runLimitCheck.totalAllowed,
      tier: "free",
    });
  }

  type ProgramRow = { id: string; schema: unknown; user_id: string };
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
      .eq("user_id", user.id);
    connections = (data ?? []) as ConnectionRow[];
  }

  type ApiKeyRow = { id: string; name: string; provider: string; is_valid: boolean };
  const { data: apiKeysRaw } = await serviceClient
    .from("api_keys")
    .select("id, name, provider, is_valid")
    .eq("user_id", user.id);
  const apiKeys = (apiKeysRaw ?? []) as ApiKeyRow[];

  const runnableSchema = executableSchema.data as unknown as ProgramSchema;
  const { result, checks } = await validatePreFlight(runnableSchema, connections, apiKeys);
  if (!result.valid) {
    return NextResponse.json({ error: "Pre-flight checks failed", checks }, { status: 422 });
  }

  // fix: select only id to tolerate envs where migration 20240006 (telemetry columns) not yet applied
  const { data: runRaw, error: runError } = await serviceClient
    .from("runs")
    .insert({
      program_id,
      triggered_by: "manual",
      status: "running",
      started_at: new Date().toISOString(),
    } as unknown as never)
    .select("id")
    .single();

  if (runError || !runRaw) {
    console.error("[/api/runs] insert failed:", runError);
    return apiError(`Failed to create run${runError?.message ? `: ${runError.message}` : ""}`, 500);
  }

  const run = runRaw as unknown as { id: string };

  // Dispatch to Python runtime — if it rejects or is unreachable, fail the run immediately
  const runtimeUrl = process.env.RUNTIME_URL ?? "http://localhost:8000";

  const markFailed = (msg: string) =>
    serviceClient
      .from("runs")
      .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() } as unknown as never)
      .eq("id", run.id);

  try {
    const runtimeRes = await fetch(`${runtimeUrl}/execute`, {
      method: "POST",
      headers: buildInternalServiceHeaders("runtime:execute", {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        run_id: run.id,
        program_id,
        user_id: user.id,
        schema: runnableSchema,
        triggered_by: "manual",
        connections: Object.fromEntries(connections.map((c) => [c.name, c.id])),
      }),
      cache: "no-store",
    });
    if (!runtimeRes.ok) {
      await markFailed(`Runtime rejected execution (${runtimeRes.status})`);
      return NextResponse.json(
        { run_id: run.id, status: "failed", error: "Runtime failed to accept the run" },
        { status: 502 }
      );
    }
  } catch {
    await markFailed("Runtime is unreachable — is the runtime service running?");
    return NextResponse.json(
      { run_id: run.id, status: "failed", error: "Runtime is unreachable" },
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

  // Verify program ownership first
  const supabase = await createServerClient();
  const { data: program, error: progError } = await supabase
    .from("programs")
    .select("id")
    .eq("id", program_id)
    .eq("user_id", user.id)
    .single();

  if (progError || !program) return apiError("Program not found", 404);

  const serviceClient = createServiceClient();
  const historyDays = await getRunHistoryDays(user.id);
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
