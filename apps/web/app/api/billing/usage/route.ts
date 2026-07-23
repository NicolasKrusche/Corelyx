import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type UsageRow = {
  id: string;
  org_id: string;
  run_id: string | null;
  execution_minutes: number;
  tokens_used: number;
  model: string;
  billing: string;
  estimated_cost_usd: number;
  billed_amount: number;
  recorded_at: string;
};

type UsageSummary = {
  total_minutes: number;
  total_tokens: number;
  total_cost: number;
  record_count: number;
  by_model: Array<{
    model: string;
    minutes: number;
    tokens: number;
    cost: number;
    count: number;
  }>;
  daily: Array<{
    date: string;
    minutes: number;
    tokens: number;
    cost: number;
  }>;
};

/**
 * GET /api/billing/usage — Get usage summary for the current billing period.
 *
 * Query params:
 *   ?days=N (default 30) — lookback window in days
 */
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10) || 30, 1), 365);

  const service = createServiceClient() as LooseServiceClient;

  // Get user's org
  const { data: membership } = await service
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return apiError("Organization not found.", 404);
  const orgId = membership.org_id;

  // Get subscription to find current period
  const { data: subscription } = await service
    .from("org_subscriptions")
    .select("plan_id, current_period_start, current_period_end")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle();

  // Calculate period start — use subscription period or N days ago
  const periodStart = subscription?.current_period_start
    ? new Date(subscription.current_period_start)
    : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sinceISO = periodStart.toISOString();

  // Fetch usage records for this org since period start
  const { data: records, error } = await service
    .from("usage_records")
    .select("execution_minutes, tokens_used, model, billing, estimated_cost_usd, recorded_at")
    .eq("org_id", orgId)
    .gte("recorded_at", sinceISO)
    .order("recorded_at", { ascending: false });

  if (error) return apiError(error.message, 500);

  const rows = (records ?? []) as UsageRow[];

  // Aggregate totals
  let totalMinutes = 0;
  let totalTokens = 0;
  let totalCost = 0;

  const byModelMap = new Map<
    string,
    { model: string; minutes: number; tokens: number; cost: number; count: number }
  >();

  const dailyMap = new Map<
    string,
    { date: string; minutes: number; tokens: number; cost: number }
  >();

  for (const row of rows) {
    totalMinutes += row.execution_minutes;
    totalTokens += row.tokens_used;
    totalCost += row.estimated_cost_usd;

    // By model aggregation
    const modelKey = row.model || "unknown";
    const existing = byModelMap.get(modelKey);
    if (existing) {
      existing.minutes += row.execution_minutes;
      existing.tokens += row.tokens_used;
      existing.cost += row.estimated_cost_usd;
      existing.count += 1;
    } else {
      byModelMap.set(modelKey, {
        model: modelKey,
        minutes: row.execution_minutes,
        tokens: row.tokens_used,
        cost: row.estimated_cost_usd,
        count: 1,
      });
    }

    // Daily aggregation
    const dayStr = row.recorded_at.slice(0, 10);
    const dayEntry = dailyMap.get(dayStr);
    if (dayEntry) {
      dayEntry.minutes += row.execution_minutes;
      dayEntry.tokens += row.tokens_used;
      dayEntry.cost += row.estimated_cost_usd;
    } else {
      dailyMap.set(dayStr, {
        date: dayStr,
        minutes: row.execution_minutes,
        tokens: row.tokens_used,
        cost: row.estimated_cost_usd,
      });
    }
  }

  const summary: UsageSummary = {
    total_minutes: Math.round(totalMinutes * 10000) / 10000,
    total_tokens: totalTokens,
    total_cost: Math.round(totalCost * 10000) / 10000,
    record_count: rows.length,
    by_model: Array.from(byModelMap.values()).sort((a, b) => b.cost - a.cost),
    daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };

  // Also fetch plan limits for context
  let planLimits = null;
  if (subscription?.plan_id) {
    const { data: plan } = await service
      .from("billing_plans")
      .select("name, slug, included_seats, included_execution_minutes, execution_price_per_minute")
      .eq("id", subscription.plan_id)
      .maybeSingle();

    if (plan) {
      planLimits = {
        ...plan,
        period_start: periodStart.toISOString(),
        period_end: subscription.current_period_end,
      };
    }
  }

  return NextResponse.json({ usage: summary, plan: planLimits });
}
