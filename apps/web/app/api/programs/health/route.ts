import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RunStatus = "completed" | "failed" | "running" | "pending" | "cancelled";

type ProgramRow = {
  id: string;
  name: string;
  execution_mode: string;
  is_active: boolean;
  last_run_at: string | null;
};

type RunRow = {
  id: string;
  program_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  billed_cost_usd: number | null;
};

type QueryResult<T> = { data: T[] | null; error: unknown };

export type WorkflowHealth = {
  id: string;
  name: string;
  execution_mode: string;
  is_active: boolean;
  last_run_at: string | null;
  recentRuns: { status: RunStatus; started_at: string }[];
  totalRuns30d: number;
  completedRuns30d: number;
  failedRuns30d: number;
  successRate: number;
  estimatedCost30d: number;
  healthStatus: "healthy" | "degraded" | "error" | "inactive";
};

export type HealthDashboardData = {
  workflows: WorkflowHealth[];
  summary: {
    activeCount: number;
    totalWorkflows: number;
    overallSuccessRate: number;
    totalCost30d: number;
    errorRate30d: number;
    errorTrend: "improving" | "worsening" | "stable";
    needsAttention: string[];
  };
};

// ---------------------------------------------------------------------------
// GET /api/programs/health
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError("Unauthorized", 401);

    const ws = await getActiveWorkspace(user.id);
    if (!ws) return apiError("No active workspace", 400);

    const serviceClient = createServiceClient();

    // Fetch all programs in the workspace
    const progQuery = serviceClient
      .from("programs")
      .select("id, name, execution_mode, is_active, last_run_at")
      .eq("workspace_id", ws.workspaceId);
    const { data: programs, error: progError } = await (progQuery as unknown as Promise<QueryResult<ProgramRow>>);

    if (progError || !programs) {
      return apiError((progError as { message?: string } | null)?.message ?? "Failed to fetch programs", 500);
    }

    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Fetch runs for all programs in the workspace (30d window)
    const programIds = programs.map((p) => p.id);

    if (programIds.length === 0) {
      return NextResponse.json({
        workflows: [],
        summary: {
          activeCount: 0,
          totalWorkflows: 0,
          overallSuccessRate: 0,
          totalCost30d: 0,
          errorRate30d: 0,
          errorTrend: "stable" as const,
          needsAttention: [],
        },
      } satisfies HealthDashboardData);
    }

    const runsQuery = serviceClient
      .from("runs")
      .select("id, program_id, status, started_at, completed_at, billed_cost_usd")
      .in("program_id", programIds)
      .gte("started_at", thirtyDaysAgo)
      .not("started_at", "is", null)
      .order("started_at", { ascending: false });
    const { data: runs, error: runsError } = await (runsQuery as unknown as Promise<QueryResult<RunRow>>);

    if (runsError) {
      console.error("Error fetching runs for health:", runsError);
      return apiError("Failed to fetch run data", 500);
    }

    // Group runs by program
    const runsByProgram = new Map<
      string,
      { status: RunStatus; started_at: string; billed_cost_usd: number }[]
    >();
    for (const run of runs ?? []) {
      const arr = runsByProgram.get(run.program_id) ?? [];
      arr.push({
        status: run.status as RunStatus,
        started_at: run.started_at,
        billed_cost_usd: run.billed_cost_usd ?? 0,
      });
      runsByProgram.set(run.program_id, arr);
    }

    // Build health data per workflow
    const workflows: WorkflowHealth[] = programs.map((program) => {
      const programRuns = runsByProgram.get(program.id) ?? [];
      const totalRuns = programRuns.length;
      const completedRuns = programRuns.filter(
        (r) => r.status === "completed",
      ).length;
      const failedRuns = programRuns.filter(
        (r) => r.status === "failed",
      ).length;
      const successRate =
        totalRuns > 0 ? (completedRuns / totalRuns) * 100 : 100;
      const cost30d = programRuns.reduce(
        (sum, r) => sum + (r.billed_cost_usd || 0),
        0,
      );

      // Recent 10 runs for health bar
      const recentRuns = programRuns.slice(0, 10);

      // Determine health status
      let healthStatus: WorkflowHealth["healthStatus"] = "healthy";
      if (!program.is_active && totalRuns === 0) {
        healthStatus = "inactive";
      } else if (failedRuns > 0 && successRate < 50) {
        healthStatus = "error";
      } else if (failedRuns > 0 || successRate < 80) {
        healthStatus = "degraded";
      }

      return {
        id: program.id,
        name: program.name,
        execution_mode: program.execution_mode,
        is_active: program.is_active,
        last_run_at: program.last_run_at,
        recentRuns,
        totalRuns30d: totalRuns,
        completedRuns30d: completedRuns,
        failedRuns30d: failedRuns,
        successRate: Math.round(successRate * 10) / 10,
        estimatedCost30d: cost30d,
        healthStatus,
      };
    });

    // Compute summary
    const totalSuccess = workflows.reduce(
      (sum, w) => sum + w.completedRuns30d,
      0,
    );
    const totalFailed = workflows.reduce(
      (sum, w) => sum + w.failedRuns30d,
      0,
    );
    const totalRunsAll = totalSuccess + totalFailed;
    const overallSuccessRate =
      totalRunsAll > 0 ? (totalSuccess / totalRunsAll) * 100 : 100;

    const activeWorkflows = workflows.filter(
      (w) => w.is_active || w.totalRuns30d > 0,
    );
    const totalCost30d = workflows.reduce(
      (sum, w) => sum + w.estimatedCost30d,
      0,
    );

    // Error rate trend: compare last 7d vs previous 7d
    const recentFailed = (runs ?? []).filter(
      (r) =>
        r.status === "failed" &&
        r.started_at >= sevenDaysAgo,
    ).length;
    const recentTotal = (runs ?? []).filter(
      (r) => r.started_at >= sevenDaysAgo,
    ).length;
    const olderFailed = (runs ?? []).filter(
      (r) =>
        r.status === "failed" &&
        r.started_at >= fourteenDaysAgo &&
        r.started_at < sevenDaysAgo,
    ).length;
    const olderTotal = (runs ?? []).filter(
      (r) =>
        r.started_at >= fourteenDaysAgo && r.started_at < sevenDaysAgo,
    ).length;

    const recentErrorRate =
      recentTotal > 0 ? (recentFailed / recentTotal) * 100 : 0;
    const olderErrorRate =
      olderTotal > 0 ? (olderFailed / olderTotal) * 100 : 0;

    let errorTrend: "improving" | "worsening" | "stable" = "stable";
    if (recentErrorRate < olderErrorRate - 5) errorTrend = "improving";
    else if (recentErrorRate > olderErrorRate + 5) errorTrend = "worsening";

    // Workflows needing attention: error status or success rate < 50%
    const needsAttention = workflows
      .filter(
        (w) =>
          w.healthStatus === "error" ||
          (w.totalRuns30d > 0 && w.successRate < 50),
      )
      .map((w) => w.name);

    return NextResponse.json({
      workflows,
      summary: {
        activeCount: activeWorkflows.length,
        totalWorkflows: workflows.length,
        overallSuccessRate: Math.round(overallSuccessRate * 10) / 10,
        totalCost30d,
        errorRate30d:
          totalRunsAll > 0
            ? Math.round(((totalFailed / totalRunsAll) * 100) * 10) / 10
            : 0,
        errorTrend,
        needsAttention,
      },
    } satisfies HealthDashboardData);
  } catch (error) {
    console.error("Health API error:", error);
    return apiError("Internal Server Error", 500);
  }
}
