import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasFounderAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/api";
import {
  billedUsd,
  getDailySeries,
  getFinanceSummary,
  getModelSpread,
  getTopUsers,
  type FinanceSummary,
} from "@/lib/admin-finance";
import { AlertTriangle, DollarSign, Landmark, TrendingUp, Users } from "lucide-react";

export const dynamic = "force-dynamic";

function usd(value: number, digits = 2): string {
  return `$${value.toFixed(digits)}`;
}

function profitOf(summary: FinanceSummary): { profit: number; margin: number | null } {
  const revenue = billedUsd(summary.billedCredits);
  const profit = revenue - summary.platformCostUsd;
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;
  return { profit, margin };
}

async function getFinanceData() {
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
    getTopUsers(db, thirtyDaysAgo, 10),
    getDailySeries(db, fourteenDaysAgo),
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

export default async function FinancesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasFounderAccess(user.id, user.email))) redirect("/admin");

  const { today, month, spread30d, topUsers30d, daily14d, userLabels, degraded } = await getFinanceData();

  const monthRevenue = billedUsd(month.billedCredits);
  const monthProfit = profitOf(month);
  const todayProfit = profitOf(today);
  const maxDailyCost = Math.max(...daily14d.map((d) => d.providerCostUsd), 0.000001);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Finances</h1>
        <p className="text-muted-foreground">LLM economics — what users are billed vs what providers charge us</p>
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

      {/* Headline: this month */}
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

      {/* Daily cost trend */}
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

      {/* Model spread */}
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Model Spread (30 days)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Cost = platform-key provider cost (ours). Billed = credit value charged to users.</p>
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
                  <th className="px-4 py-3 font-medium text-right">Billed</th>
                  <th className="px-6 py-3 font-medium text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {spread30d.map((row) => {
                  const revenue = billedUsd(row.billedCredits);
                  const profit = revenue - row.platformCostUsd;
                  return (
                    <tr key={row.model}>
                      <td className="px-6 py-3 font-medium text-foreground">{row.model}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{row.callCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{row.totalTokens.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-foreground">{usd(row.platformCostUsd, 4)}</td>
                      <td className="px-4 py-3 text-right text-foreground">{usd(revenue, 4)}</td>
                      <td className={`px-6 py-3 text-right font-semibold ${profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        {usd(profit, 4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top users */}
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
    </div>
  );
}
