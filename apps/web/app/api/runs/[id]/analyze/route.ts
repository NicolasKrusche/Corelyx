import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canView, getProgramAccess } from "@/lib/workspaces";
import {
  analyzeFailure,
  type NodeExecutionError,
} from "@/lib/runs/failure-analysis";

/**
 * POST /api/runs/[id]/analyze
 *
 * Analyzes a failed run's node executions and returns structured root-cause
 * analysis with category, explanation, and fix suggestions.
 */
export async function POST(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> },
) {
  const { id: runId } = await routeParams;

  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const serviceClient = createServiceClient();

  // ── Fetch run ────────────────────────────────────────────────────────────
  type RunRow = {
    id: string;
    program_id: string;
    status: string;
    error_message: string | null;
  };
  const { data: runRaw, error: runError } = await serviceClient
    .from("runs")
    .select("id, program_id, status, error_message")
    .eq("id", runId)
    .single();

  if (runError || !runRaw) return apiError("Run not found", 404);

  const run = runRaw as unknown as RunRow;

  // Verify access
  const access = await getProgramAccess(run.program_id, user.id);
  if (!canView(access)) return apiError("Run not found", 404);

  // ── Fetch node executions ─────────────────────────────────────────────────
  type ExecRow = {
    node_id: string;
    status: string;
    error_message: string | null;
    input_payload: unknown;
    output_payload: unknown;
    retry_count: number | null;
  };

  const { data: execsRaw } = await serviceClient
    .from("node_executions")
    .select("node_id, status, error_message, input_payload, output_payload, retry_count")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  const allExecs = (execsRaw ?? []) as ExecRow[];
  const failedExecs: NodeExecutionError[] = allExecs
    .filter((e) => e.status === "failed")
    .map((e) => ({
      node_id: e.node_id,
      error_message: e.error_message,
      input_payload: e.input_payload,
      output_payload: e.output_payload,
      retry_count: e.retry_count,
    }));

  // If no per-node failures, use the run-level error as a single "node"
  if (failedExecs.length === 0 && run.error_message) {
    // Try to find which node was executing when the run failed
    const lastExec = allExecs[allExecs.length - 1];
    failedExecs.push({
      node_id: lastExec?.node_id ?? "unknown",
      error_message: run.error_message,
    });
  }

  if (failedExecs.length === 0) {
    // Nothing to classify — let analyzeFailure produce the empty result so the
    // shape and wording match every other response from this route.
    return NextResponse.json({
      analysis: analyzeFailure(runId, null, [], {}),
    });
  }

  // ── Fetch node metadata from program schema ───────────────────────────────
  const { data: program } = await serviceClient
    .from("programs")
    .select("schema")
    .eq("id", run.program_id)
    .single();

  type ProgramRow = { schema: { nodes?: Array<{ id: string; label?: string; type?: string }> } };
  const prog = program as unknown as ProgramRow | null;
  const schemaNodes = prog?.schema?.nodes ?? [];
  const nodeMap: Record<string, { label?: string; type?: string }> = {};
  for (const n of schemaNodes) {
    nodeMap[n.id] = { label: n.label, type: n.type };
  }

  // ── Run analysis ──────────────────────────────────────────────────────────
  const analysis = analyzeFailure(runId, run.error_message, failedExecs, nodeMap);

  return NextResponse.json({ analysis });
}
