/**
 * Program analytics data access layer.
 *
 * Fetches aggregated cost/token data for the per-program analytics dashboard.
 * Primary path: RPC functions from migration 20260722120000 (fast, server-side).
 * Fallback path (migration not applied yet): scan runs + node_executions rows
 * and aggregate in JS — degraded but functional.
 *
 * Usage: call from server components or API routes that already verified
 * program access via getProgramAccess().
 */
import { createServiceClient } from "@/lib/api";

type Db = ReturnType<typeof createServiceClient>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CostTrendRow = {
  runId: string;
  status: string;
  startedAt: string;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelCallCount: number;
  durationMs: number | null;
};

export type NodeTypeCostRow = {
  nodeType: string;
  executionCount: number;
  totalTokens: number;
  totalCostUsd: number;
  avgTokens: number;
  avgCostUsd: number;
};

export type ModelComparisonRow = {
  model: string;
  callCount: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostPerCall: number;
  source: string;
};

export type AnalyticsSummary = {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  totalCostUsd: number;
  totalTokens: number;
  totalModelCalls: number;
  avgCostPerRun: number;
  avgTokensPerRun: number;
  totalDurationMs: number;
};

export type AnalyticsResult<T> = { data: T; degraded: boolean };

// ---------------------------------------------------------------------------
// RPC helpers (primary path)
// ---------------------------------------------------------------------------

async function callRpc(
  db: Db,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown[] | null; error: unknown }> {
  // Supabase JS v2 RPC call
  const result = await (db as any).rpc(fn, args);
  return result;
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

export async function getCostTrend(
  programId: string,
  limit = 50,
): Promise<AnalyticsResult<CostTrendRow[]>> {
  const db = createServiceClient();

  // Try RPC first
  const { data, error } = await callRpc(db, "program_cost_trend", {
    p_program_id: programId,
    p_limit: limit,
  });

  if (!error && Array.isArray(data)) {
    return {
      data: data.map((r: any) => ({
        runId: r.run_id,
        status: r.status,
        startedAt: r.started_at,
        costUsd: Number(r.cost_usd ?? 0),
        promptTokens: Number(r.prompt_tokens ?? 0),
        completionTokens: Number(r.completion_tokens ?? 0),
        totalTokens: Number(r.total_tokens ?? 0),
        modelCallCount: Number(r.model_call_count ?? 0),
        durationMs: r.duration_ms != null ? Number(r.duration_ms) : null,
      })),
      degraded: false,
    };
  }

  // Fallback: scan runs directly
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: runsRaw } = await db
    .from("runs")
    .select(
      "id, status, started_at, estimated_cost_usd, prompt_tokens, completion_tokens, total_tokens, model_call_count, completed_at",
    )
    .eq("program_id", programId)
    .gte("started_at", thirtyDaysAgo)
    .not("started_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit);

  const rows = (runsRaw ?? []) as any[];
  return {
    data: rows.map((r) => {
      const start = r.started_at ? new Date(r.started_at).getTime() : 0;
      const end = r.completed_at ? new Date(r.completed_at).getTime() : null;
      return {
        runId: r.id,
        status: r.status,
        startedAt: r.started_at,
        costUsd: Number(r.estimated_cost_usd ?? 0),
        promptTokens: Number(r.prompt_tokens ?? 0),
        completionTokens: Number(r.completion_tokens ?? 0),
        totalTokens: Number(r.total_tokens ?? 0),
        modelCallCount: Number(r.model_call_count ?? 0),
        durationMs: end != null ? end - start : null,
      };
    }),
    degraded: true,
  };
}

export async function getCostByNodeType(
  programId: string,
): Promise<AnalyticsResult<NodeTypeCostRow[]>> {
  const db = createServiceClient();

  const { data, error } = await callRpc(db, "program_cost_by_node_type", {
    p_program_id: programId,
  });

  if (!error && Array.isArray(data)) {
    return {
      data: data.map((r: any) => ({
        nodeType: r.node_type ?? "unknown",
        executionCount: Number(r.execution_count ?? 0),
        totalTokens: Number(r.total_tokens ?? 0),
        totalCostUsd: Number(r.total_cost_usd ?? 0),
        avgTokens: Number(r.avg_tokens ?? 0),
        avgCostUsd: Number(r.avg_cost_usd ?? 0),
      })),
      degraded: false,
    };
  }

  // Fallback: aggregate from node_executions
  const { data: execsRaw } = await db
    .from("node_executions")
    .select("node_id, status, total_tokens, estimated_cost_usd, input_payload")
    .in("status", ["completed", "failed"]);

  const execs = (execsRaw ?? []) as any[];
  const byType = new Map<string, NodeTypeCostRow>();

  for (const e of execs) {
    const nodeType = "unknown";
    const existing = byType.get(nodeType) ?? {
      nodeType,
      executionCount: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      avgTokens: 0,
      avgCostUsd: 0,
    };
    existing.executionCount++;
    existing.totalTokens += Number(e.total_tokens ?? 0);
    existing.totalCostUsd += Number(e.estimated_cost_usd ?? 0);
    byType.set(nodeType, existing);
  }

  return {
    data: Array.from(byType.values())
      .map((r) => ({
        ...r,
        avgTokens: r.executionCount > 0 ? r.totalTokens / r.executionCount : 0,
        avgCostUsd:
          r.executionCount > 0 ? r.totalCostUsd / r.executionCount : 0,
      }))
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd),
    degraded: true,
  };
}

export async function getModelComparison(
  programId: string,
): Promise<AnalyticsResult<ModelComparisonRow[]>> {
  const db = createServiceClient();

  const { data, error } = await callRpc(db, "program_model_comparison", {
    p_program_id: programId,
  });

  if (!error && Array.isArray(data)) {
    return {
      data: data.map((r: any) => ({
        model: r.model ?? "unknown",
        callCount: Number(r.call_count ?? 0),
        totalTokens: Number(r.total_tokens ?? 0),
        totalCostUsd: Number(r.total_cost_usd ?? 0),
        avgCostPerCall: Number(r.avg_cost_per_call ?? 0),
        source: r.source ?? "workflow",
      })),
      degraded: false,
    };
  }

  // Fallback: aggregate from llm_usage_logs joined with runs
  const { data: logsRaw } = await db
    .from("llm_usage_logs")
    .select("model, total_tokens, estimated_cost_usd, source, run_id");

  const logs = (logsRaw ?? []) as any[];
  // Filter to this program's runs
  const { data: programRuns } = await db
    .from("runs")
    .select("id")
    .eq("program_id", programId);
  const runIds = new Set((programRuns ?? []).map((r: any) => r.id));

  const byModel = new Map<string, ModelComparisonRow>();

  for (const l of logs) {
    if (!runIds.has(l.run_id)) continue;
    const key = `${l.model ?? "unknown"}|${l.source ?? "workflow"}`;
    const existing = byModel.get(key) ?? {
      model: l.model ?? "unknown",
      callCount: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      avgCostPerCall: 0,
      source: l.source ?? "workflow",
    };
    existing.callCount++;
    existing.totalTokens += Number(l.total_tokens ?? 0);
    existing.totalCostUsd += Number(l.estimated_cost_usd ?? 0);
    byModel.set(key, existing);
  }

  return {
    data: Array.from(byModel.values())
      .map((r) => ({
        ...r,
        avgCostPerCall: r.callCount > 0 ? r.totalCostUsd / r.callCount : 0,
      }))
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd),
    degraded: true,
  };
}

export async function getAnalyticsSummary(
  programId: string,
): Promise<AnalyticsResult<AnalyticsSummary>> {
  const db = createServiceClient();

  const { data, error } = await callRpc(db, "program_analytics_summary", {
    p_program_id: programId,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    const r = data[0] as any;
    return {
      data: {
        totalRuns: Number(r.total_runs ?? 0),
        completedRuns: Number(r.completed_runs ?? 0),
        failedRuns: Number(r.failed_runs ?? 0),
        totalCostUsd: Number(r.total_cost_usd ?? 0),
        totalTokens: Number(r.total_tokens ?? 0),
        totalModelCalls: Number(r.total_model_calls ?? 0),
        avgCostPerRun: Number(r.avg_cost_per_run ?? 0),
        avgTokensPerRun: Number(r.avg_tokens_per_run ?? 0),
        totalDurationMs: Number(r.total_duration_ms ?? 0),
      },
      degraded: false,
    };
  }

  // Fallback: aggregate from runs
  const { data: runsRaw } = await db
    .from("runs")
    .select(
      "status, estimated_cost_usd, total_tokens, model_call_count, started_at, completed_at",
    )
    .eq("program_id", programId)
    .not("started_at", "is", null);

  const runs = (runsRaw ?? []) as any[];
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const totalCostUsd = runs.reduce(
    (sum, r) => sum + Number(r.estimated_cost_usd ?? 0),
    0,
  );
  const totalTokens = runs.reduce(
    (sum, r) => sum + Number(r.total_tokens ?? 0),
    0,
  );
  const totalModelCalls = runs.reduce(
    (sum, r) => sum + Number(r.model_call_count ?? 0),
    0,
  );
  const totalDurationMs = runs.reduce((sum, r) => {
    if (r.started_at && r.completed_at) {
      return (
        sum +
        (new Date(r.completed_at).getTime() -
          new Date(r.started_at).getTime())
      );
    }
    return sum;
  }, 0);

  const countWithCost = runs.filter((r) => r.status !== "pending").length || 1;

  return {
    data: {
      totalRuns,
      completedRuns,
      failedRuns,
      totalCostUsd,
      totalTokens,
      totalModelCalls,
      avgCostPerRun: totalCostUsd / countWithCost,
      avgTokensPerRun: totalTokens / countWithCost,
      totalDurationMs,
    },
    degraded: true,
  };
}
