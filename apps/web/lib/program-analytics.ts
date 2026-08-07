/**
 * Program analytics data access layer.
 *
 * Fetches aggregated cost/token data for the per-program analytics dashboard.
 * Primary path: RPC functions from migration 20260722120000, rewritten by
 * 20260802130000 to aggregate billed cost (the user-facing figure) instead of
 * raw provider cost. Fallback path (migration not applied yet): scan runs +
 * node_executions rows and aggregate in JS — degraded but functional.
 *
 * Usage: call from server components or API routes that already verified
 * program access via getProgramAccess().
 */
import { createServiceClient } from "@/lib/api";
import type { Database } from "@flowos/db";

type Db = ReturnType<typeof createServiceClient>;
type DbFunctions = Database["public"]["Functions"];

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

export type TokenUsageRow = {
  nodeType: string;
  totalPrompt: number;
  totalCompletion: number;
  totalTokens: number;
  totalCostUsd: number;
  callCount: number;
  modelsUsed: string[];
};

export type AnalyticsResult<T> = { data: T; degraded: boolean };

// ---------------------------------------------------------------------------
// RPC helpers (primary path)
// ---------------------------------------------------------------------------

/**
 * The RPCs this module depends on, resolved against the generated Database
 * types instead of being passed as a bare string.
 *
 * `Extract` rather than a plain union is what makes drift loud: if one of these
 * functions is renamed or dropped from database.types.ts, its name leaves this
 * union and the call site stops compiling. The previous `(db as any).rpc(...)`
 * type-checked no matter what, so a renamed function or a changed argument name
 * stayed green and only showed up in production as every program quietly
 * rendering the degraded fallback.
 */
type AnalyticsRpc = Extract<
  keyof DbFunctions,
  | "program_analytics_summary"
  | "program_cost_by_node_type"
  | "program_cost_trend"
  | "program_model_comparison"
  | "program_token_usage_summary"
>;

async function callRpc<Fn extends AnalyticsRpc>(
  db: Db,
  fn: Fn,
  args: DbFunctions[Fn]["Args"],
): Promise<{ data: unknown[] | null; error: unknown }> {
  // Supabase JS v2 RPC call. These functions all return a JSON array; anything
  // else is treated as "no usable result" so the caller takes the fallback,
  // which is what the `Array.isArray` guard at each call site did before.
  const { data, error } = await db.rpc(fn, args);
  return { data: Array.isArray(data) ? (data as unknown[]) : null, error };
}

// ---------------------------------------------------------------------------
// Fallback helpers (degraded path)
// ---------------------------------------------------------------------------

// PostgREST caps a single response at ~1000 rows, so an unbounded fallback read
// silently truncates instead of erroring. Every fallback scan below pages.
const PAGE_SIZE = 1000;
// Run ids go into an `?run_id=in.(...)` query string; chunking keeps that URL
// far below the server's request-line limit for programs with many runs.
const RUN_ID_CHUNK = 200;

type NodeExecutionRow = {
  node_id: string;
  status: string | null;
  total_tokens: number | null;
  billed_cost_usd: number | null;
  input_payload: unknown;
};

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/**
 * Every run id for a program.
 *
 * Ordered by id so `.range()` paging is stable — without an explicit order
 * PostgREST gives no row-order guarantee across requests, which would let a
 * page repeat or skip rows and skew the aggregates built from them.
 */
async function fetchProgramRunIds(db: Db, programId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("runs")
      .select("id")
      .eq("program_id", programId)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) break;
    const page = (data ?? []) as { id: string }[];
    for (const row of page) ids.push(row.id);
    if (page.length < PAGE_SIZE) break;
  }
  return ids;
}

/** Completed/failed node executions for the given runs, chunked and paged. */
async function fetchLlmUsageLogs(db: Db, runIds: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (const ids of chunkIds(runIds, RUN_ID_CHUNK)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db
        .from("llm_usage_logs")
        .select("model, total_tokens, estimated_cost_usd, billing, billed_credits, source, run_id")
        .in("run_id", ids)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) break;
      const page = (data ?? []) as any[];
      for (const row of page) rows.push(row);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

async function fetchNodeExecutions(db: Db, runIds: string[]): Promise<NodeExecutionRow[]> {
  const rows: NodeExecutionRow[] = [];
  for (const ids of chunkIds(runIds, RUN_ID_CHUNK)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db
        .from("node_executions")
        .select("node_id, status, total_tokens, billed_cost_usd, input_payload")
        .in("run_id", ids)
        .in("status", ["completed", "failed"])
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) break;
      const page = (data ?? []) as NodeExecutionRow[];
      for (const row of page) rows.push(row);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

/**
 * node_id → node type, read from the program's own schema.
 *
 * The schema is the authoritative record of what a node is. The analytics RPCs
 * used to guess from `output_payload->>'type'`, which picks up the "object" of
 * a JSON-Schema-shaped output and collapsed every node into one bucket called
 * "object" (see migration 20260805120000).
 */
async function getNodeTypesFromSchema(
  db: Db,
  programId: string,
): Promise<Map<string, string>> {
  const { data } = await db
    .from("programs")
    .select("schema")
    .eq("id", programId)
    .single();

  const nodes = (data as any)?.schema?.nodes;
  const byId = new Map<string, string>();
  if (Array.isArray(nodes)) {
    for (const n of nodes) {
      if (n?.id && n?.type) byId.set(String(n.id), String(n.type));
    }
  }
  return byId;
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
      "id, status, started_at, billed_cost_usd, prompt_tokens, completion_tokens, total_tokens, model_call_count, completed_at",
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
        costUsd: Number(r.billed_cost_usd ?? 0),
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

  // Fallback: aggregate from node_executions.
  //
  // This query used to have no program filter at all — it summed the whole
  // node_executions table, so one program's analytics reported every other
  // program's executions and cost. Scope it to this program's runs.
  //
  // Both reads page: the run-id fetch used to stop at PostgREST's ~1000-row cap
  // (so a busy program undercounted, and the truncated id list still risked
  // overflowing the `.in()` URL), and the executions fetch has the same cap.
  const runIds = await fetchProgramRunIds(db, programId);

  if (runIds.length === 0) return { data: [], degraded: true };

  const execs = await fetchNodeExecutions(db, runIds);

  const nodeTypeById = await getNodeTypesFromSchema(db, programId);

  const byType = new Map<string, NodeTypeCostRow>();

  for (const e of execs) {
    const nodeType =
      nodeTypeById.get(e.node_id) ??
      (e.input_payload as any)?._node_type ??
      "unknown";
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
    existing.totalCostUsd += Number(e.billed_cost_usd ?? 0);
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

  // Fallback: aggregate from llm_usage_logs joined with runs. Cost shown to
  // users is the billed figure: marked-up platform charge (billed_credits,
  // 1000 credits = $1) or raw BYOK/free pass-through — never raw platform cost.
  // Scoped to this program's runs in the query rather than after the fact. The
  // previous shape selected from llm_usage_logs with no filter at all, so
  // PostgREST's ~1000-row cap truncated it to the newest rows across every user
  // and program — on a busy install the client-side run_id filter then matched
  // almost nothing and the comparison came back near-empty. Chunked and paged
  // like the node-execution fallback, for the same reason.
  const runIds = await fetchProgramRunIds(db, programId);
  if (runIds.length === 0) return { data: [], degraded: true };
  const logs = await fetchLlmUsageLogs(db, runIds);

  const byModel = new Map<string, ModelComparisonRow>();

  for (const l of logs) {
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
    existing.totalCostUsd +=
      l.billing === "platform" && Number(l.billed_credits ?? 0) > 0
        ? Number(l.billed_credits) / 1000
        : Number(l.estimated_cost_usd ?? 0);
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

/**
 * Token usage broken down by node type, sourced from the token_usage JSONB
 * captured on node_executions (migration 20260724_token_usage_telemetry).
 *
 * Uses the program_token_usage_summary RPC (service-role only). When the
 * migration has not been applied yet — or no node has recorded token_usage —
 * this returns an empty, degraded result rather than throwing.
 */
export async function getTokenUsageSummary(
  programId: string,
): Promise<AnalyticsResult<TokenUsageRow[]>> {
  const db = createServiceClient();

  const { data, error } = await callRpc(db, "program_token_usage_summary", {
    p_program_id: programId,
  });

  if (!error && Array.isArray(data)) {
    return {
      data: data.map((r: any) => ({
        nodeType: r.node_type ?? "unknown",
        totalPrompt: Number(r.total_prompt ?? 0),
        totalCompletion: Number(r.total_completion ?? 0),
        totalTokens: Number(r.total_tokens ?? 0),
        totalCostUsd: Number(r.total_cost_usd ?? 0),
        callCount: Number(r.call_count ?? 0),
        modelsUsed: Array.isArray(r.models_used)
          ? (r.models_used as unknown[]).map((m) => String(m))
          : [],
      })),
      degraded: false,
    };
  }

  return { data: [], degraded: true };
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
      "status, billed_cost_usd, total_tokens, model_call_count, started_at, completed_at",
    )
    .eq("program_id", programId)
    .not("started_at", "is", null);

  const runs = (runsRaw ?? []) as any[];
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const totalCostUsd = runs.reduce(
    (sum, r) => sum + Number(r.billed_cost_usd ?? 0),
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
