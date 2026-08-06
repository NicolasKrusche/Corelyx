import { createServiceClient } from "@/lib/api";
import { ENTITLEMENTS } from "@/lib/entitlements";

/* Admin LLM finance data access.

   Primary path: the admin_llm_* SQL aggregations from migration
   20260708120000 (exact, unbounded). Fallback path (migration not applied
   yet): scan raw llm_usage_logs rows — capped at FALLBACK_ROW_CAP — and
   aggregate in JS, so the pages keep working degraded instead of 500ing.

   Semantics: estimated_cost_usd is RAW provider cost in USD.
     - billing = 'platform' → we pay the provider (this is OUR cost)
     - billing = 'byok'     → the user's own key pays (passthrough, not ours)
   billed_credits is what the user was charged (1000 credits = $1). */

export { CREDITS_PER_USD } from "@/lib/credit-packs";
import { CREDITS_PER_USD } from "@/lib/credit-packs";

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

/**
 * Nominal USD value of a credit balance at the headline pack rate.
 *
 * This is a VALUATION, not revenue. Consuming a credit moves no money: the cash
 * event was either the pack purchase (earlier) or the subscription charge (also
 * earlier), and for free-tier and comped accounts there was never a cash event
 * at all. Use getFundingSplit to find out which. It is also nominal rather than
 * realized — the $25/$50 packs grant bonus credits, so credits actually bought
 * at 1050-1100 per USD are valued here at 1000. For real cash use
 * lib/admin-revenue (credit_purchases.price_usd).
 */
export function billedUsd(billedCredits: number): number {
  return billedCredits / CREDITS_PER_USD;
}

/* ── Funding split ────────────────────────────────────────────────────────
   Consumed platform credits, grouped by where the money came from. This is the
   distinction the old "Revenue = billed_credits / 1000" headline erased. */

export type FundingBucket =
  /** Platform cost with no credit charge at all — Genesis (metered by the
   *  genesis_uses quota), or a call the provider reported no cost for. */
  | "unbilled"
  /** Admin and unlimited-tier accounts. deductUserCredits returns true without
   *  charging them, but the runtime logs billed_credits anyway, so these
   *  credits are notional. The provider cost is real. */
  | "comped"
  /** Free-tier monthly allowance. No cash event now or ever — acquisition cost. */
  | "free_included"
  /** Paid-plan monthly allowance. Covered by the subscription, which was
   *  already counted as revenue when it was charged. */
  | "plan_included"
  /** Drawn from a paid top-up balance. Cash was collected at purchase time;
   *  consuming it draws down deferred revenue. */
  | "purchased";

export const FUNDING_BUCKETS: FundingBucket[] = [
  "purchased",
  "plan_included",
  "free_included",
  "comped",
  "unbilled",
];

export type FundingSplitRow = {
  bucket: FundingBucket;
  billedCredits: number;
  platformCostUsd: number;
  userCount: number;
};

/** tier → monthly included credits, for the SQL side. Unlimited is omitted:
 *  those users are classified as comped, never by allowance. */
export function tierAllowances(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [tier, entitlements] of Object.entries(ENTITLEMENTS)) {
    out[tier] = entitlements.includedAiCredits ?? 0;
  }
  return out;
}

function emptySplit(): Record<FundingBucket, FundingSplitRow> {
  return Object.fromEntries(
    FUNDING_BUCKETS.map((bucket) => [bucket, { bucket, billedCredits: 0, platformCostUsd: 0, userCount: 0 }]),
  ) as Record<FundingBucket, FundingSplitRow>;
}

function isFundingBucket(value: string): value is FundingBucket {
  return (FUNDING_BUCKETS as string[]).includes(value);
}

export async function getFundingSplit(
  db: Db,
  since: string,
): Promise<FinanceResult<FundingSplitRow[]>> {
  const rpc = await (db as any).rpc("admin_llm_funding_split", {
    since,
    tier_allowances: tierAllowances(),
  });
  if (!rpc.error && Array.isArray(rpc.data)) {
    const split = emptySplit();
    for (const raw of rpc.data as Record<string, unknown>[]) {
      const bucket = String(raw.bucket ?? "");
      if (!isFundingBucket(bucket)) continue;
      split[bucket] = {
        bucket,
        billedCredits: Number(raw.billed_credits ?? 0),
        platformCostUsd: Number(raw.platform_cost_usd ?? 0),
        userCount: Number(raw.user_count ?? 0),
      };
    }
    return { degraded: false, data: FUNDING_BUCKETS.map((bucket) => split[bucket]) };
  }

  // Migration 20260802140000 not applied: bucket the capped raw scan in JS.
  const rows = (await fetchRawRows(db, since)).filter((row) => rowBilling(row) === "platform");
  const split = emptySplit();

  const unbilledUsers = new Set<string>();
  const perUser = new Map<string, { credits: number; cost: number }>();
  for (const row of rows) {
    const cost = row.estimated_cost_usd ?? 0;
    const credits = row.billed_credits ?? 0;
    if (credits <= 0) {
      split.unbilled.platformCostUsd += cost;
      if (row.user_id) unbilledUsers.add(row.user_id);
      continue;
    }
    if (!row.user_id) continue;
    const entry = perUser.get(row.user_id) ?? { credits: 0, cost: 0 };
    entry.credits += credits;
    entry.cost += cost;
    perUser.set(row.user_id, entry);
  }
  split.unbilled.userCount = unbilledUsers.size;

  const userIds = [...perUser.keys()];
  const profiles = new Map<string, { tier: string; isAdmin: boolean }>();
  if (userIds.length > 0) {
    const { data } = await (db as any)
      .from("profiles")
      .select("id, tier, is_admin")
      .in("id", userIds);
    for (const row of (data ?? []) as Array<{ id: string; tier: string | null; is_admin: boolean | null }>) {
      profiles.set(row.id, { tier: row.tier ?? "free", isAdmin: row.is_admin === true });
    }
  }

  const allowances = tierAllowances();
  for (const [userId, usage] of perUser) {
    const profile = profiles.get(userId) ?? { tier: "free", isAdmin: false };
    if (profile.isAdmin || profile.tier === "unlimited") {
      split.comped.billedCredits += usage.credits;
      split.comped.platformCostUsd += usage.cost;
      split.comped.userCount += 1;
      continue;
    }

    const allowance = allowances[profile.tier] ?? 0;
    const included = Math.min(usage.credits, allowance);
    const purchased = Math.max(usage.credits - allowance, 0);
    const includedCost = usage.credits > 0 ? (usage.cost * included) / usage.credits : 0;
    const purchasedCost = usage.credits > 0 ? (usage.cost * purchased) / usage.credits : 0;

    const includedBucket = profile.tier === "free" ? split.free_included : split.plan_included;
    if (included > 0) {
      includedBucket.billedCredits += included;
      includedBucket.platformCostUsd += includedCost;
      includedBucket.userCount += 1;
    }
    if (purchased > 0) {
      split.purchased.billedCredits += purchased;
      split.purchased.platformCostUsd += purchasedCost;
      split.purchased.userCount += 1;
    }
  }

  return { degraded: true, data: FUNDING_BUCKETS.map((bucket) => split[bucket]) };
}

/** Provider cost we will never see a matching cash inflow for: the free-tier
 *  allowance, comped accounts, and quota-metered Genesis usage. Plan-included
 *  consumption is excluded — the subscription paid for it. */
export function unrecoveredCostUsd(split: FundingSplitRow[]): number {
  return split
    .filter((row) => row.bucket === "free_included" || row.bucket === "comped" || row.bucket === "unbilled")
    .reduce((total, row) => total + row.platformCostUsd, 0);
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
