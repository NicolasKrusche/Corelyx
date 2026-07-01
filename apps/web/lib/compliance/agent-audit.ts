import type { createServiceClient } from "@/lib/api";

// Loose client: the audit tables (node_executions, agent_reports) are not in the
// generated typed schema surface, so we widen `.from()` the same way the route does.
type LooseServiceClient = ReturnType<typeof createServiceClient> & { from(table: string): any };

const MAX_AUDIT_RUNS = 200;

export type AgentAuditData = {
  agent: { id: string; name: string };
  run_count: number;
  runs: Array<{
    run_id: string;
    status: string;
    triggered_by: string | null;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    node_executions: Array<Record<string, unknown>>;
    reports: Array<Record<string, unknown>>;
  }>;
};

/**
 * Collect a reasoning-linked audit of everything an agent did across its runs —
 * tool calls, outcomes, and per-run reports (EU AI Act Art. 12/14-style logging).
 * Tool *arguments* are never persisted, so none leak here.
 *
 * Single source of truth shared by GET /api/agents/[id]/audit and the workspace
 * evidence pack, so both emit an identical audit shape.
 */
export async function collectAgentAudit(
  db: LooseServiceClient,
  program: { id: string; name: string }
): Promise<AgentAuditData> {
  const { data: runRows } = await db
    .from("runs")
    .select("id, status, triggered_by, started_at, completed_at, error_message")
    .eq("program_id", program.id)
    .order("created_at", { ascending: false })
    .limit(MAX_AUDIT_RUNS);

  const runs = (runRows ?? []) as Array<{
    id: string;
    status: string;
    triggered_by: string | null;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
  }>;

  const runIds = runs.map((r) => r.id);
  const execByRun = new Map<string, Array<Record<string, unknown>>>();
  const reportsByRun = new Map<string, Array<Record<string, unknown>>>();

  if (runIds.length > 0) {
    const [{ data: execRows }, { data: reportRows }] = await Promise.all([
      db
        .from("node_executions")
        .select("run_id, node_id, status, output_payload, error_message")
        .in("run_id", runIds),
      db
        .from("agent_reports")
        .select("run_id, title, dry_run, created_at")
        .in("run_id", runIds),
    ]);

    for (const ne of (execRows ?? []) as Array<{
      run_id: string;
      node_id: string;
      status: string | null;
      output_payload: Record<string, unknown> | null;
      error_message: string | null;
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

  return {
    agent: { id: program.id, name: program.name },
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
}
