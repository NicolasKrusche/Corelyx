import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasCostsAccess, hasFounderAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/api";
import {
  billedUsd,
  getDailySeries,
  getFinanceSummary,
  getModelSpread,
  getTopUsers,
  type DailyRow,
  type FinanceSummary,
  type ModelSpreadRow,
  type TopUserRow,
} from "@/lib/admin-finance";
import { AlertTriangle, DollarSign, Landmark, TrendingUp, Users } from "lucide-react";

export const dynamic = "force-dynamic";

/* One page for everything money: platform LLM cost (what we pay providers),
   revenue (what users are billed), and margin.

   Access is tiered, mirroring the two pages this replaced:
     - cost + model spread  → founder, dev, marketing  (hasCostsAccess)
     - revenue, margin, top users → founder only        (hasFounderAccess)
   Non-founders reaching this page see the cost half only. */

/** Spend levels that colour the bars below. MONITORING ONLY — nothing in the
 *  platform halts spend when these are crossed. The only enforced cost ceiling
 *  is per-run (MAX_COST_PER_RUN / MAX_COST_PER_RUN_PAID in the runtime). */
const DAILY_ALERT_USD = Number(process.env.ADMIN_COST_ALERT_DAILY_USD ?? 100);
const MONTHLY_ALERT_USD = Number(process.env.ADMIN_COST_ALERT_MONTHLY_USD ?? 1000);

function usd(value: number, digits = 2): string {
  return `$${value.toFixed(digits)}`;
}

function profitOf(summary: FinanceSummary): { profit: number; margin: number | null } {
  const revenue = billedUsd(summary.billedCredits);
  const profit = revenue - summary.platformCostUsd;
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;
  return { profit, margin };
}

function barColor(percent: number, base: string): string {
  return percent > 90 ? "bg-red-500" : percent > 70 ? "bg-yellow-500" : base;
}

async function getFinanceData(includeFounderData: boolean) {
  const db = createServiceClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [today, month, spread30d, topUsers30d, daily14d] = await Promise.all([
    getFinanceSummary(db, todayStart),
    getFinanceSummary(db, monthStart),
    getModelSpread(db, thirtyDaysAgo),
    includeFounderData
      ? getTopUsers(db, thirtyDaysAgo, 10)
      : Promise.resolve({ data: [] as TopUserRow[], degraded: false }),
    includeFounderData
      ? getDailySeries(db, fourteenDaysAgo)
      : Promise.resolve({ data: [] as DailyRow[], degraded: false }),
  ]);

  // Human-readable labels for the top-user rows.
  const userIds = topUsers30d.data.map((u) => u.userId).filter(Boolean);
  const userLabels = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await (db as any)
      .from("profiles")
      .select("id, display_name, username")
      .in("id", userIds);
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null; username: string | null }>) {
      userLabels.set(p.id, p.display_name || p.username || p.id.slice(0, 8));
    }
  }

  const degraded =
    today.degraded || month.degraded || spread30d.degraded || topUsers30d.degraded || daily14d.degraded;

  return {
    today: today.data,
    month: month.data,
    spread30d: spread30d.data,
    topUsers30d: topUsers30d.data,
    daily14d: daily14d.data,
    userLabels,
    degraded,
  };
}

function SpendCard({
  label,
  value,
  spent,
  threshold,
  baseColor,
  icon,
}: {
  label: string;
  value: string;
  spent: number;
  threshold: number;
  baseColor: string;
  icon: React.ReactNode;
}) {
  const percent = threshold > 0 ? (spent / threshold) * 100 : 0;
  return (
    <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      <div className="mt-2">
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`h-2 rounded-full ${barColor(percent, baseColor)}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {percent.toFixed(1)}% of {usd(threshold, 0)} alert threshold
        </p>
      </div>
    </div>
  );
}

export default async function FinancesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");

  // Costs access is the floor for this page; revenue/margin/top-users need founder.
  const [canViewCosts, isFounder] = await Promise.all([
    hasCostsAccess(user.id, user.email),
    hasFounderAccess(user.id, user.email),
  ]);
  if (!canViewCosts) redirect("/admin");

  const { today, month, spread30d, topUsers30d, daily14d, userLabels, degraded } =
    await getFinanceData(isFounder);

  const monthRevenue = billedUsd(month.billedCredits);
  const monthProfit = profitOf(month);
  const todayProfit = profitOf(today);
  const maxDailyCost = Math.max(...daily14d.map((d) => d.providerCostUsd), 0.000001);

  const dailyPercent = DAILY_ALERT_USD > 0 ? (today.platformCostUsd / DAILY_ALERT_USD) * 100 : 0;
  const monthlyPercent = MONTHLY_ALERT_USD > 0 ? (month.platformCostUsd / MONTHLY_ALERT_USD) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
          Finances
        </h1>
        <p className="text-muted-foreground">
          {isFounder
            ? "LLM economics — what users are billed vs what providers charge us"
            : "LLM usage and platform-key cost"}
        </p>
      </div>

      {degraded && (
        <div className="bg-yellow-500/10 border-l-4 border-yellow-500/60 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3 text-sm text-yellow-700 dark:text-yellow-300">
              <p className="font-medium">Showing approximate numbers</p>
              <p>Migration 20260708120000 (billing columns + finance aggregations) is not applied to this database, so figures are computed from a capped raw-row scan.</p>
            </div>
          </div>
        </div>
      )}

      {/* Founder headline: revenue / cost / profit. */}
      {isFounder && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Revenue (MTD)</p>
              <Landmark className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="text-3xl font-bold text-foreground">{usd(monthRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {month.billedCredits.toLocaleString()} credits billed to users
            </p>
          </div>

          <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">LLM Cost (MTD)</p>
              <DollarSign className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-3xl font-bold text-foreground">{usd(month.platformCostUsd, 4)}</p>
            <p className="text-xs text-muted-foreground mt-2">
              platform-key provider cost · {usd(month.byokCostUsd, 4)} BYOK passthrough
            </p>
          </div>

          <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Gross Profit (MTD)</p>
              <TrendingUp className={`w-5 h-5 ${monthProfit.profit >= 0 ? "text-emerald-500" : "text-red-500"}`} />
            </div>
            <p className={`text-3xl font-bold ${monthProfit.profit >= 0 ? "text-foreground" : "text-red-500"}`}>
              {usd(monthProfit.profit)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {monthProfit.margin === null ? "no billed usage yet" : `${monthProfit.margin.toFixed(1)}% margin`}
            </p>
          </div>

          <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Today</p>
              <Users className="w-5 h-5 text-purple-500" />
            </div>
            <p className="text-3xl font-bold text-foreground">{usd(todayProfit.profit)}</p>
            <p className="text-xs text-muted-foreground mt-2">
              profit · {usd(today.platformCostUsd, 4)} cost · {today.distinctUsers} active {today.distinctUsers === 1 ? "user" : "users"}
            </p>
          </div>
        </div>
      )}

      {/* Spend vs alert thresholds (from the former Costs & Billing page). */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SpendCard
          label="Today's Cost"
          value={usd(today.platformCostUsd)}
          spent={today.platformCostUsd}
          threshold={DAILY_ALERT_USD}
          baseColor="bg-green-500"
          icon={<DollarSign className="w-5 h-5 text-green-500" />}
        />
        <SpendCard
          label="Monthly Cost"
          value={usd(month.platformCostUsd)}
          spent={month.platformCostUsd}
          threshold={MONTHLY_ALERT_USD}
          baseColor="bg-blue-500"
          icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
        />
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">Active Users</p>
            <Users className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-foreground">{today.distinctUsers}</p>
          <p className="text-xs text-muted-foreground mt-2">Users with LLM usage today</p>
        </div>
      </div>

      {/* These thresholds only colour the bars above. Say so plainly — a red bar
          that looks like a cap but never stops anything is worse than no bar. */}
      <div className="bg-muted/40 rounded-lg border border-border p-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Alert thresholds are monitoring only.</span>{" "}
          Nothing halts platform spend when {usd(DAILY_ALERT_USD, 0)}/day or {usd(MONTHLY_ALERT_USD, 0)}/month is crossed —
          the bars turn red and that is all. The only enforced cost ceiling is per-run
          (<code className="text-[11px]">MAX_COST_PER_RUN</code>, ${"5"} free / ${"50"} paid), which does not bound
          aggregate spend across users. Override the thresholds with{" "}
          <code className="text-[11px]">ADMIN_COST_ALERT_DAILY_USD</code> /{" "}
          <code className="text-[11px]">ADMIN_COST_ALERT_MONTHLY_USD</code>.
        </p>
      </div>

      {(dailyPercent > 80 || monthlyPercent > 80) && (
        <div className="bg-yellow-500/10 border-l-4 border-yellow-500/60 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                Approaching Alert Threshold
              </h3>
              <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                {dailyPercent > 80 && <p>Daily cost at {dailyPercent.toFixed(0)}% of threshold</p>}
                {monthlyPercent > 80 && <p>Monthly cost at {monthlyPercent.toFixed(0)}% of threshold</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily cost trend — founder only (carries billed revenue per day). */}
      {isFounder && (
        <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Daily Spend (14 days)</h2>
          </div>
          <div className="p-6">
            {daily14d.length === 0 ? (
              <p className="text-sm text-muted-foreground">No LLM usage recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {daily14d.map((d) => {
                  const revenue = billedUsd(d.billedCredits);
                  return (
                    <div key={d.day} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{d.day}</span>
                      <div className="h-3 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-3 rounded-full bg-red-500/70"
                          style={{ width: `${Math.min((d.providerCostUsd / maxDailyCost) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="w-40 shrink-0 text-right text-xs text-muted-foreground">
                        {usd(d.providerCostUsd, 4)} cost · {usd(revenue)} billed
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Model spread — cost for everyone; billed/profit columns founder-only. */}
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Model Spread (30 days)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isFounder
              ? "Cost = platform-key provider cost (ours). Billed = credit value charged to users."
              : "Cost = platform-key provider cost (ours). BYOK calls are paid by the user's own key."}
          </p>
        </div>
        {spread30d.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">No LLM usage recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium text-right">Calls</th>
                  <th className="px-4 py-3 font-medium text-right">Tokens</th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                  {isFounder && <th className="px-4 py-3 font-medium text-right">Billed</th>}
                  {isFounder && <th className="px-6 py-3 font-medium text-right">Profit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {spread30d.map((row: ModelSpreadRow) => {
                  const revenue = billedUsd(row.billedCredits);
                  const profit = revenue - row.platformCostUsd;
                  return (
                    <tr key={row.model}>
                      <td className="px-6 py-3 font-medium text-foreground">{row.model}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{row.callCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{row.totalTokens.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-foreground">{usd(row.platformCostUsd, 4)}</td>
                      {isFounder && <td className="px-4 py-3 text-right text-foreground">{usd(revenue, 4)}</td>}
                      {isFounder && (
                        <td className={`px-6 py-3 text-right font-semibold ${profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                          {usd(profit, 4)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top users — founder only (names + per-user spend). */}
      {isFounder && (
        <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Top Users by Cost (30 days)</h2>
          </div>
          {topUsers30d.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No LLM usage recorded yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {topUsers30d.map((row) => (
                <div key={row.userId} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{userLabels.get(row.userId) ?? row.userId.slice(0, 8)}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.callCount.toLocaleString()} calls · {row.totalTokens.toLocaleString()} tokens
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">{usd(row.providerCostUsd, 4)}</p>
                    <p className="text-xs text-muted-foreground">{usd(billedUsd(row.billedCredits))} billed</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Per-run ceilings — these ARE enforced, in the runtime limiter. */}
      <div className="bg-muted/40 rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-1">Per-Run Limits</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Enforced by the runtime limiter — a run that crosses a ceiling aborts with RunLimitExceeded.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-foreground/80">Free Plan</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>Max $5 per run</li>
              <li>Max 100 nodes per run</li>
              <li>Max 100k LLM tokens per run</li>
              <li>Max 10 min execution time</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground/80">Paid Plans</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>Max $50 per run</li>
              <li>Max 500 nodes per run</li>
              <li>Max 1M LLM tokens per run</li>
              <li>Max 30 min execution time</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
