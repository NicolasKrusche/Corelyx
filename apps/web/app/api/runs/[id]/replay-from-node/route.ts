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
import { checkRunLimit } from "@/lib/limits";
import { isNotificationEnabled } from "@/lib/notification-prefs";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { getRuntimeUrl } from "@/lib/runtime-url";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { canRun, canView, getProgramAccess } from "@/lib/workspaces";
import { resolveWorkspaceEnvVars } from "@/lib/env-vars";
import { sendRunLimitWarningEmail } from "@/lib/email";
import { getUserTier } from "@/lib/limits";
import { getAgentModelAccessIssue } from "@/lib/agent-model-access";
import { validatePreFlight } from "@/lib/validation/pre-flight";

/**
 * POST /api/runs/[id]/replay-from-node
 *
 * Re-executes a workflow from a specific node with edited input data.
 * Body: { node_id: string, edited_input: Record<string, any> }
 *
 * Pre-computes upstream_outputs from the original run so the runtime
 * can pre-seed state without an extra DB lookup.
 */
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const { id: originalRunId } = await routeParams;

  const supabase = await createServerClient();
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const processingRestriction = await ensureProcessingAllowed(user.id);
  if (processingRestriction) return processingRestriction;

  // Parse body
  let body: { node_id?: string; edited_input?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  if (!body.node_id) return apiError("node_id is required", 400);

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
  if (!canRun(access))
    return apiError("You do not have permission to replay this run.", 403);

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
  if (
    runLimitCheck.warnAt80Percent &&
    user.email &&
    runLimitCheck.currentCount &&
    runLimitCheck.totalAllowed
  ) {
    void isNotificationEnabled(user.id, "run_limit_warnings").then(
      (enabled) => {
        if (enabled) {
          void sendRunLimitWarningEmail({
            to: user.email!,
            used: runLimitCheck.currentCount!,
            total: runLimitCheck.totalAllowed!,
            tier: "free",
          });
        }
      }
    );
  }

  // Validate schema
  const schema = prog.schema as unknown as ProgramSchema;
  const executableSchema = ProgramSchemaZ.safeParse(schema);
  if (!executableSchema.success) {
    return NextResponse.json(
      {
        error: "WORKFLOW_NOT_RUNNABLE",
        message:
          "The current workflow schema is not ready to run. Complete the highlighted node settings first.",
        details: executableSchema.error.flatten(),
      },
      { status: 422 }
    );
  }

  // Validate that node_id exists in the schema
  const schemaData = executableSchema.data as unknown as ProgramSchema;
  const targetNode = schemaData.nodes.find((n) => n.id === body.node_id);
  if (!targetNode) {
    return apiError(
      `Node "${body.node_id}" not found in the current workflow schema`,
      404
    );
  }

  // Fetch the original run's node executions to compute upstream outputs
  type NodeExecRow = {
    id: string;
    node_id: string;
    status: string;
    input_payload: unknown;
    output_payload: unknown;
  };
  const { data: originalExecs, error: execsError } = await serviceClient
    .from("node_executions")
    .select("id, node_id, status, input_payload, output_payload")
    .eq("run_id", originalRunId)
    .order("created_at", { ascending: true });

  if (execsError)
    return apiError("Failed to fetch original run history", 500);

  const origExecs = (originalExecs ?? []) as unknown as NodeExecRow[];

  // Build edges_from map for upstream computation
  const edgesFrom: Record<string, string[]> = {};
  for (const edge of schemaData.edges) {
    if (!edgesFrom[edge.from]) edgesFrom[edge.from] = [];
    edgesFrom[edge.from].push(edge.to);
  }

  // Compute upstream node IDs by walking backwards from target node
  const incomingEdges: Record<string, string[]> = {};
  for (const edge of schemaData.edges) {
    if (!incomingEdges[edge.to]) incomingEdges[edge.to] = [];
    incomingEdges[edge.to].push(edge.from);
  }

  const upstreamNodeIds = new Set<string>();
  const stack = [body.node_id!];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const predecessor of incomingEdges[current] ?? []) {
      if (!upstreamNodeIds.has(predecessor)) {
        upstreamNodeIds.add(predecessor);
        stack.push(predecessor);
      }
    }
  }

  // Build upstream_outputs from original run's node_executions
  const upstreamOutputs: Record<string, Record<string, unknown>> = {};
  const outputByNodeId: Record<string, unknown> = {};
  for (const exec of origExecs) {
    // Use latest execution per node (first found due to ascending order)
    if (!(exec.node_id in outputByNodeId)) {
      outputByNodeId[exec.node_id] = exec.output_payload;
    }
  }

  for (const nodeId of upstreamNodeIds) {
    const output = outputByNodeId[nodeId];
    if (output && typeof output === "object") {
      upstreamOutputs[nodeId] = output as Record<string, unknown>;
    }
  }

  // Create the new run record with parent_run_id for provenance
  const { data: newRunRaw, error: newRunError } = await serviceClient
    .from("runs")
    .insert({
      program_id: original.program_id,
      status: "running",
      triggered_by: "replay_from_node",
      started_at: new Date().toISOString(),
      trigger_payload: body.edited_input ?? original.trigger_payload,
    } as unknown as never)
    .select("id")
    .single();

  if (newRunError || !newRunRaw) {
    serverLog({
      level: "error",
      event: "runs.replay_from_node.insert_failed",
      message: "Replay-from-node run row insert failed.",
    });
    return apiError(
      `Failed to create replay run${newRunError?.message ? `: ${newRunError.message}` : ""}`,
      500
    );
  }

  const newRun = newRunRaw as unknown as { id: string };

  const markFailed = (msg: string) =>
    serviceClient
      .from("runs")
      .update({
        status: "failed",
        error_message: msg,
        completed_at: new Date().toISOString(),
      } as unknown as never)
      .eq("id", newRun.id);

  // Dispatch to runtime
  const runtimeUrl = getRuntimeUrl();
  try {
    const envVars = await resolveWorkspaceEnvVars(programWorkspaceId);

    // Fetch connections for pre-flight validation
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

    // Pre-flight validation
    const { result, checks } = await validatePreFlight(
      schemaData,
      connections,
      apiKeys
    );
    if (!result.valid) {
      return NextResponse.json(
        { error: "Pre-flight checks failed", checks },
        { status: 422 }
      );
    }

    // Build connection map for runtime
    const connectionMap: Record<string, string> = {};
    for (const c of connections) {
      connectionMap[c.name] = c.id;
      connectionMap[`${c.provider}:primary`] = c.id;
    }

    const runtimeBody = JSON.stringify({
      run_id: newRun.id,
      start_node_id: body.node_id,
      start_input: body.edited_input ?? {},
      upstream_outputs: upstreamOutputs,
      original_run_id: originalRunId,
      trigger_payload: original.trigger_payload ?? null,
      connections: connectionMap,
      env_vars: envVars,
    });

    const runtimeHeaders = buildRuntimeExecuteHeaders(runtimeBody);
    const runtimeRes = await fetch(`${runtimeUrl}/execute-from-node`, {
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
          run_id: newRun.id,
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
      { run_id: newRun.id, status: "failed", error: "Runtime is unreachable", message },
      { status: 503 }
    );
  }

  return NextResponse.json({
    run_id: newRun.id,
    program_id: original.program_id,
    status: "running",
    message: `Replay from node "${body.node_id}" started`,
  });
}
