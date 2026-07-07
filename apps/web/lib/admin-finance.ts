import { createServiceClient } from "@/lib/api";

/* Admin LLM finance data access.

   Primary path: the admin_llm_* SQL aggregations from migration
   20260708120000 (exact, unbounded). Fallback path (migration not applied
   yet): scan raw llm_usage_logs rows — capped at FALLBACK_ROW_CAP — and
   aggregate in JS, so the pages keep working degraded instead of 500ing.

   Semantics: estimated_cost_usd is RAW provider cost in USD.
     - billing = 'platform' → we pay the provider (this is OUR cost)
     - billing = 'byok'     → the user's own key pays (passthrough, not ours)
   billed_credits is what the user was charged (1000 credits = $1). */

export const CREDITS_PER_USD = 1000;

const FALLBACK_ROW_CAP = 5000;

type Db = ReturnType<typeof createServiceClient>;

export type FinanceSummary = {
  callCount: number;
  distinctUsers: number;
  totalTokens: number;
  providerCostUsd: number;
  platformCostUsd: number;
  byokCostUsd: number;
  billedCredits: number;
};

export type ModelSpreadRow = {
  model: string;
  callCount: number;
  totalTokens: number;
  providerCostUsd: number;
  platformCostUsd: number;
  billedCredits: number;
};

export type TopUserRow = {
  userId: string;
  callCount: number;
  totalTokens: number;
  providerCostUsd: number;
  billedCredits: number;
};

export type DailyRow = {
  day: string;
  callCount: number;
  providerCostUsd: number;
  platformCostUsd: number;
  billedCredits: number;
};

/** True once any finance query had to use the degraded fallback path. */
export type FinanceResult<T> = { data: T; degraded: boolean };

export function billedUsd(billedCredits: number): number {
  return billedCredits / CREDITS_PER_USD;
}

type RawUsageRow = {
  user_id: string | null;
  model: string | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  billing?: string | null;
  billed_credits?: number | null;
  created_at: string;
};

async function fetchRawRows(db: Db, since: string): Promise<RawUsageRow[]> {
  // Enriched columns first; retry without them when the billing migration is
  // missing (same fallback pattern as the trigger routes).
  const enriched = await (db as any)
    .from("llm_usage_logs")
    .select("user_id, model, total_tokens, estimated_cost_usd, billing, billed_credits, created_at")
    .gte("created_at", since)
    .limit(FALLBACK_ROW_CAP);
  if (!enriched.error) return (enriched.data ?? []) as RawUsageRow[];

  const base = await (db as any)
    .from("llm_usage_logs")
    .select("user_id, model, total_tokens, estimated_cost_usd, created_at")
    .gte("created_at", since)
    .limit(FALLBACK_ROW_CAP);
  if (base.error) return [];
  return (base.data ?? []) as RawUsageRow[];
}

// Rows without a billing column predate the billing migration; they were only
// ever produced by platform-key calls, so attribute them as platform cost.
function rowBilling(row: RawUsageRow): "platform" | "byok" {
  return row.billing === "byok" ? "byok" : "platform";
}

export async function getFinanceSummary(db: Db, since: string): Promise<FinanceResult<FinanceSummary>> {
  const rpc = await (db as any).rpc("admin_llm_finance_summary", { since });
  if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
    const row = rpc.data[0] as Record<string, unknown>;
    return {
      degraded: false,
      data: {
        callCount: Number(row.call_count ?? 0),
        distinctUsers: Number(row.distinct_users ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        providerCostUsd: Number(row.provider_cost_usd ?? 0),
        platformCostUsd: Number(row.platform_cost_usd ?? 0),
        byokCostUsd: Number(row.byok_cost_usd ?? 0),
        billedCredits: Number(row.billed_credits ?? 0),
      },
    };
  }

  const rows = await fetchRawRows(db, since);
  const summary: FinanceSummary = {
    callCount: rows.length,
    distinctUsers: new Set(rows.map((r) => r.user_id).filter(Boolean)).size,
    totalTokens: 0,
    providerCostUsd: 0,
    platformCostUsd: 0,
    byokCostUsd: 0,
    billedCredits: 0,
  };
  for (const row of rows) {
    const cost = row.estimated_cost_usd ?? 0;
    summary.totalTokens += row.total_tokens ?? 0;
    summary.providerCostUsd += cost;
    if (rowBilling(row) === "platform") summary.platformCostUsd += cost;
    else summary.byokCostUsd += cost;
    summary.billedCredits += row.billed_credits ?? 0;
  }
  return { degraded: true, data: summary };
}

export async function getModelSpread(db: Db, since: string): Promise<FinanceResult<ModelSpreadRow[]>> {
  const rpc = await (db as any).rpc("admin_llm_model_spread", { since });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return {
      degraded: false,
      data: (rpc.data as Record<string, unknown>[]).map((row) => ({
        model: String(row.model ?? "unknown"),
        callCount: Number(row.call_count ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        providerCostUsd: Number(row.provider_cost_usd ?? 0),
        platformCostUsd: Number(row.platform_cost_usd ?? 0),
        billedCredits: Number(row.billed_credits ?? 0),
      })),
    };
  }

  const rows = await fetchRawRows(db, since);
  const byModel = new Map<string, ModelSpreadRow>();
  for (const row of rows) {
    const model = row.model ?? "unknown";
    const entry = byModel.get(model) ?? {
      model,
      callCount: 0,
      totalTokens: 0,
      providerCostUsd: 0,
      platformCostUsd: 0,
      billedCredits: 0,
    };
    const cost = row.estimated_cost_usd ?? 0;
    entry.callCount += 1;
    entry.totalTokens += row.total_tokens ?? 0;
    entry.providerCostUsd += cost;
    if (rowBilling(row) === "platform") entry.platformCostUsd += cost;
    entry.billedCredits += row.billed_credits ?? 0;
    byModel.set(model, entry);
  }
  return {
    degraded: true,
    data: [...byModel.values()].sort((a, b) => b.providerCostUsd - a.providerCostUsd),
  };
}

export async function getTopUsers(db: Db, since: string, maxRows = 10): Promise<FinanceResult<TopUserRow[]>> {
  const rpc = await (db as any).rpc("admin_llm_top_users", { since, max_rows: maxRows });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return {
      degraded: false,
      data: (rpc.data as Record<string, unknown>[]).map((row) => ({
        userId: String(row.user_id ?? ""),
        callCount: Number(row.call_count ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        providerCostUsd: Number(row.provider_cost_usd ?? 0),
        billedCredits: Number(row.billed_credits ?? 0),
      })),
    };
  }

  const rows = await fetchRawRows(db, since);
  const byUser = new Map<string, TopUserRow>();
  for (const row of rows) {
    if (!row.user_id) continue;
    const entry = byUser.get(row.user_id) ?? {
      userId: row.user_id,
      callCount: 0,
      totalTokens: 0,
      providerCostUsd: 0,
      billedCredits: 0,
    };
    entry.callCount += 1;
    entry.totalTokens += row.total_tokens ?? 0;
    entry.providerCostUsd += row.estimated_cost_usd ?? 0;
    entry.billedCredits += row.billed_credits ?? 0;
    byUser.set(row.user_id, entry);
  }
  return {
    degraded: true,
    data: [...byUser.values()]
      .sort((a, b) => b.providerCostUsd - a.providerCostUsd)
      .slice(0, maxRows),
  };
}

export async function getDailySeries(db: Db, since: string): Promise<FinanceResult<DailyRow[]>> {
  const rpc = await (db as any).rpc("admin_llm_daily_series", { since });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return {
      degraded: false,
      data: (rpc.data as Record<string, unknown>[]).map((row) => ({
        day: String(row.day ?? ""),
        callCount: Number(row.call_count ?? 0),
        providerCostUsd: Number(row.provider_cost_usd ?? 0),
        platformCostUsd: Number(row.platform_cost_usd ?? 0),
        billedCredits: Number(row.billed_credits ?? 0),
      })),
    };
  }

  const rows = await fetchRawRows(db, since);
  const byDay = new Map<string, DailyRow>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    const entry = byDay.get(day) ?? {
      day,
      callCount: 0,
      providerCostUsd: 0,
      platformCostUsd: 0,
      billedCredits: 0,
    };
    const cost = row.estimated_cost_usd ?? 0;
    entry.callCount += 1;
    entry.providerCostUsd += cost;
    if (rowBilling(row) === "platform") entry.platformCostUsd += cost;
    entry.billedCredits += row.billed_credits ?? 0;
    byDay.set(day, entry);
  }
  return {
    degraded: true,
    data: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}
