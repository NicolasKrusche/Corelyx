import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canView, getProgramAccess } from "@/lib/workspaces";

// GET /api/agents/[id]/audit — downloadable JSON audit of every action this agent
// took across all its runs (tool calls, outcomes, reports). Backs the governance
// story: an exportable, reasoning-linked record of what the agent did (EU AI Act
// Art. 12/14-style logging). Tool arguments are never stored, so none leak here.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: programId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(programId, user.id);
  if (!canView(access)) return apiError("Agent not found", 404);

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };

  const { data: progRow } = await service
    .from("programs")
    .select("id, name, program_type")
    .eq("id", programId)
    .maybeSingle();
  const program = progRow as { id: string; name: string; program_type: string | null } | null;
  if (!program || program.program_type !== "agent") return apiError("Agent not found", 404);

  const { data: runRows } = await service
    .from("runs")
    .select("id, status, triggered_by, started_at, completed_at, error_message")
    .eq("program_id", programId)
    .order("created_at", { ascending: false })
    .limit(200);
  const runs = (runRows ?? []) as Array<{
    id: string; status: string; triggered_by: string | null;
    started_at: string | null; completed_at: string | null; error_message: string | null;
  }>;

  const runIds = runs.map((r) => r.id);
  const execByRun = new Map<string, Array<Record<string, unknown>>>();
  const reportsByRun = new Map<string, Array<Record<string, unknown>>>();

  if (runIds.length > 0) {
    const [{ data: execRows }, { data: reportRows }] = await Promise.all([
      service
        .from("node_executions")
        .select("run_id, node_id, status, output_payload, error_message")
        .in("run_id", runIds),
      service
        .from("agent_reports")
        .select("run_id, title, dry_run, created_at")
        .in("run_id", runIds),
    ]);

    for (const ne of (execRows ?? []) as Array<{
      run_id: string; node_id: string; status: string | null;
      output_payload: Record<string, unknown> | null; error_message: string | null;
    }>) {
      const rawCalls = ne.output_payload?.tool_calls;
      const toolCalls = Array.isArray(rawCalls)
        ? (rawCalls as Array<Record<string, unknown>>).filter((c) => typeof c?.tool === "string")
        : [];
      const list = execByRun.get(ne.run_id) ?? [];
      list.push({ node_id: ne.node_id, status: ne.status, error_message: ne.error_message, tool_calls: toolCalls });
      execByRun.set(ne.run_id, list);
    }
    for (const r of (reportRows ?? []) as Array<{ run_id: string; title: string | null; dry_run: boolean; created_at: string }>) {
      const list = reportsByRun.get(r.run_id) ?? [];
      list.push({ title: r.title, dry_run: r.dry_run, created_at: r.created_at });
      reportsByRun.set(r.run_id, list);
    }
  }

  const audit = {
    agent: { id: program.id, name: program.name },
    exported_at: new Date().toISOString(),
    exported_by: user.id,
    run_count: runs.length,
    runs: runs.map((r) => ({
      run_id: r.id,
      status: r.status,
      triggered_by: r.triggered_by,
      started_at: r.started_at,
      completed_at: r.completed_at,
      error_message: r.error_message,
      node_executions: execByRun.get(r.id) ?? [],
      reports: reportsByRun.get(r.id) ?? [],
    })),
  };

  const filename = `agent-${program.id}-audit.json`;
  return new NextResponse(JSON.stringify(audit, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
