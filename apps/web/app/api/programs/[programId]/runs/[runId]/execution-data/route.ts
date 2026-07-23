import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canView, getProgramAccess } from "@/lib/workspaces";

// GET /api/programs/[programId]/runs/[runId]/execution-data
// Returns node execution data for a specific run — read-only, zero cost.
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ programId: string; runId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const { programId, runId } = params;

  const access = await getProgramAccess(programId, user.id);
  if (!canView(access)) return apiError("Run not found", 404);

  const serviceClient = createServiceClient();

  // Verify the run belongs to this program
  const { data: runRaw, error: runError } = await serviceClient
    .from("runs")
    .select("id, program_id, status, started_at, completed_at, triggered_by, trigger_payload, error_message, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, connector_api_calls, model_call_count")
    .eq("id", runId)
    .eq("program_id", programId)
    .single();

  if (runError || !runRaw) return apiError("Run not found", 404);

  type RunRow = {
    id: string;
    program_id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    triggered_by: string;
    trigger_payload: unknown;
    error_message: string | null;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    connector_api_calls: number;
    model_call_count: number;
  };

  const run = runRaw as unknown as RunRow;

  // Fetch node executions for this run
  type NodeExecutionRow = {
    id: string;
    node_id: string;
    status: string;
    input_payload: unknown;
    output_payload: unknown;
    error_message: string | null;
    retry_count: number | null;
    started_at: string | null;
    completed_at: string | null;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    connector_api_calls: number;
    model_call_count: number;
    created_at: string;
  };

  const { data: execsRaw, error: execsError } = await serviceClient
    .from("node_executions")
    .select(
      "id, node_id, status, input_payload, output_payload, error_message, retry_count, started_at, completed_at, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, connector_api_calls, model_call_count, created_at"
    )
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (execsError) return apiError(execsError.message, 500);

  const nodeExecutions = (execsRaw ?? []) as unknown as NodeExecutionRow[];

  return NextResponse.json({
    run: {
      id: run.id,
      status: run.status,
      started_at: run.started_at,
      completed_at: run.completed_at,
      triggered_by: run.triggered_by,
      trigger_payload: run.trigger_payload,
      error_message: run.error_message,
      total_tokens: run.total_tokens,
      prompt_tokens: run.prompt_tokens,
      completion_tokens: run.completion_tokens,
      estimated_cost_usd: run.estimated_cost_usd,
      connector_api_calls: run.connector_api_calls,
      model_call_count: run.model_call_count,
    },
    node_executions: nodeExecutions.map((e) => ({
      node_id: e.node_id,
      status: e.status,
      input_payload: e.input_payload,
      output_payload: e.output_payload,
      error_message: e.error_message,
      retry_count: e.retry_count,
      started_at: e.started_at,
      completed_at: e.completed_at,
      total_tokens: e.total_tokens,
      prompt_tokens: e.prompt_tokens,
      completion_tokens: e.completion_tokens,
      estimated_cost_usd: e.estimated_cost_usd,
      connector_api_calls: e.connector_api_calls,
      model_call_count: e.model_call_count,
      created_at: e.created_at,
    })),
  });
}
