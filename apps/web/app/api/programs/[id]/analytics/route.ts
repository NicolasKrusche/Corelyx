import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.programs.analytics");

type RunRow = {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  total_cost_usd: number | null;
  total_tokens: number | null;
};

type NodeExecRow = {
  node_id: string;
  node_type: string;
  status: string;
  estimated_cost_usd: number | null;
  estimated_tokens: number | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Resolved outside the try so the catch below can still log programId — it
  // was declared inside the try, leaving `id` out of scope in the handler.
  const { id } = await params;
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Verify user has access to this program
    const { data: program, error: programError } = await supabase
      .from("programs")
      .select("id, workspaces!inner(user_id)")
      .eq("id", id)
      .eq("workspaces.user_id", user.id)
      .single();

    if (programError || !program) {
      return new NextResponse("Program not found", { status: 404 });
    }

    // Fetch runs with cost data
    const runsResult = await (supabase
      .from("runs")
      .select("id, started_at, completed_at, status, total_cost_usd, total_tokens")
      .eq("program_id", id)
      .order("started_at", { ascending: false })
      .limit(100) as unknown as Promise<{ data: RunRow[] | null; error: unknown }>);
    const { data: runs, error: runsError } = runsResult;

    if (runsError) {
      log.error({ error: runsError, programId: id }, "Error fetching runs");
      return new NextResponse("Internal Server Error", { status: 500 });
    }

    // Fetch node-level cost breakdown
    const nodeResult = await (supabase
      .from("node_executions")
      .select(`
        node_id,
        node_type,
        status,
        estimated_cost_usd,
        estimated_tokens,
        runs!inner(program_id, id)
      `)
      .eq("runs.program_id", id)
      .not("estimated_cost_usd", "is", null) as unknown as Promise<{ data: NodeExecRow[] | null; error: unknown }>);
    const { data: nodeExecutions, error: nodeError } = nodeResult;

    if (nodeError) {
      log.warn({ error: nodeError, programId: id }, "Error fetching node executions");
    }

    // Aggregate node costs
    const nodeCostMap = new Map<string, {
      node_id: string;
      node_type: string;
      total_runs: number;
      total_cost_usd: number;
      total_tokens: number;
    }>();

    for (const exec of nodeExecutions || []) {
      const existing = nodeCostMap.get(exec.node_id) || {
        node_id: exec.node_id,
        node_type: exec.node_type,
        total_runs: 0,
        total_cost_usd: 0,
        total_tokens: 0,
      };
      existing.total_runs += 1;
      existing.total_cost_usd += exec.estimated_cost_usd || 0;
      existing.total_tokens += exec.estimated_tokens || 0;
      nodeCostMap.set(exec.node_id, existing);
    }

    const nodeCostBreakdown = Array.from(nodeCostMap.values()).map((item) => ({
      ...item,
      avg_cost_usd: item.total_runs > 0 ? item.total_cost_usd / item.total_runs : 0,
    }));

    // Compute summary stats
    const totalCost = (runs || []).reduce((sum, r) => sum + (r.total_cost_usd || 0), 0);
    const totalTokens = (runs || []).reduce((sum, r) => sum + (r.total_tokens || 0), 0);
    const totalRuns = (runs || []).length;
    const avgCostPerRun = totalRuns > 0 ? totalCost / totalRuns : 0;

    return NextResponse.json({
      summary: {
        total_cost_usd: totalCost,
        total_tokens: totalTokens,
        total_runs: totalRuns,
        avg_cost_per_run: avgCostPerRun,
      },
      runs: (runs || []).map((r) => ({
        run_id: r.id,
        started_at: r.started_at,
        total_cost_usd: r.total_cost_usd || 0,
        total_tokens: r.total_tokens || 0,
        status: r.status,
      })),
      node_breakdown: nodeCostBreakdown,
    });
  } catch (error) {
    log.error({ error, programId: id }, "Analytics API error");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
