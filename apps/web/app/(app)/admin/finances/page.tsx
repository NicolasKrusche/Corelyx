import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasCostsAccess, hasFounderAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/api";
import {
  billedUsd,
  getDailySeries,
  getFinanceSummary,
  getFundingSplit,
  getModelSpread,
  getTopUsers,
  unrecoveredCostUsd,
  type DailyRow,
  type FundingBucket,
  type FundingSplitRow,
  type ModelSpreadRow,
  type TopUserRow,
} from "@/lib/admin-finance";
import {
  getCreditLiability,
  getCreditSales,
  getStripeFees,
  getSubscriptionRevenue,
  sumTotals,
  totalsToUsd,
  usdPerEur,
  type CurrencyTotals,
} from "@/lib/admin-revenue";
import { formatCredits } from "@/lib/credit-packs";
import { AlertTriangle, CreditCard, DollarSign, Landmark, Repeat, TrendingUp, Users, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

/* One page for everything money.
 *
 * The distinction this page exists to keep straight: consuming a credit is not
 * a cash event. Revenue happens when Stripe charges a subscription or a credit
 * pack; consumption just draws down something already paid for (or, on the free
 * and comped tiers, something nobody ever paid for). The previous version of
 * this page called SUM(billed_credits)/1000 "Revenue", which booked phantom
 * income for free-tier and admin usage and produced a "margin" that was pinned
 * at ~90% by construction — billed_credits is derived from cost via
 * PLATFORM_MARKUP, so profit was always exactly cost x 9.
 *
 * Real revenue now comes from Stripe (subscriptions) and credit_purchases
 * (packs). Credit consumption is reported separately, as a funding split.
 *
 * Access is tiered:
 *   - cost + model spread            → founder, dev, marketing (hasCostsAccess)
 *   - revenue, margin, top users     → founder only            (hasFounderAccess)
 */

/** Spend levels that colour the bars below. MONITORING ONLY — nothing in the
 *  platform halts spend when these are crossed. The only enforced cost ceiling
 *  is per-run (MAX_COST_PER_RUN / MAX_COST_PER_RUN_PAID in the runtime). */
const DAILY_ALERT_USD = Number(process.env.ADMIN_COST_ALERT_DAILY_USD ?? 100);
const MONTHLY_ALERT_USD = Number(process.env.ADMIN_COST_ALERT_MONTHLY_USD ?? 1000);

function usd(value: number, digits = 2): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(digits)}`;
}

function barColor(percent: number, base: string): string {
  return percent > 90 ? "bg-red-500" : percent > 70 ? "bg-yellow-500" : base;
}

function isZeroTotals(totals: CurrencyTotals): boolean {
  return Object.values(totals).every((amount) => amount === 0);
}

/** "€120.00 + $30.00" — the native amounts behind a converted USD figure. */
function nativeBreakdown(totals: CurrencyTotals): string | null {
  const parts = Object.entries(totals)
    .filter(([, amount]) => amount !== 0)
    .map(([currency, amount]) => `${amount.toFixed(2)} ${currency.toUpperCase()}`);
  if (parts.length === 0) return null;
  if (parts.length === 1 && parts[0].endsWith("USD")) return null;
  return parts.join(" + ");
}

const BUCKET_LABEL: Record<FundingBucket, { label: string; note: string; tone: string }> = {
  purchased: {
    label: "Paid top-up balance",
    note: "Cash collected at purchase — consuming it draws down deferred revenue",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  plan_included: {
    label: "Plan allowance (paid tiers)",
    note: "Covered by the subscription; no separate cash event",
    tone: "text-blue-600 dark:text-blue-400",
  },
  free_included: {
    label: "Free-tier allowance",
    note: "No cash event, ever — this is acquisition cost",
    tone: "text-amber-600 dark:text-amber-400",
  },
  comped: {
    label: "Admin / unlimited",
    note: "Never actually charged; the logged credits are notional",
    tone: "text-purple-600 dark:text-purple-400",
  },
  unbilled: {
    label: "Unbilled platform calls",
    note: "Genesis (metered by quota) and zero-cost provider responses",
    tone: "text-muted-foreground",
  },
};

async function getFinanceData(includeFounderData: boolean) {
  const db = createServiceClient();
  const now = new Date();
  // UTC boundaries, not server-local ones. The monthly credit allowance resets
  // on the UTC month (lib/credits.ts::maybeResetIncluded), so a local-midnight
  // window would start hours on the wrong side of the reset and mis-attribute
  // that usage between the plan allowance and the paid top-up balance. Stripe
  // timestamps are UTC too, so this keeps revenue and consumption on one clock.
  const todayStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const todayStart = todayStartDate.toISOString();
  const monthStart = monthStartDate.toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [today, month, spread30d, topUsers30d, daily14d, fundingMonth, subscriptions, fees, creditSales, liability] =
    await Promise.all([
      getFinanceSummary(db, todayStart),
      getFinanceSummary(db, monthStart),
      getModelSpread(db, thirtyDaysAgo),
      includeFounderData
        ? getTopUsers(db, thirtyDaysAgo, 10)
        : Promise.resolve({ data: [] as TopUserRow[], degraded: false }),
      includeFounderData
        ? getDailySeries(db, fourteenDaysAgo)
        : Promise.resolve({ data: [] as DailyRow[], degraded: false }),
      includeFounderData
        ? getFundingSplit(db, monthStart)
        : Promise.resolve({ data: [] as FundingSplitRow[], degraded: false }),
      includeFounderData ? getSubscriptionRevenue(monthStartDate) : null,
      includeFounderData ? getStripeFees(monthStartDate) : null,
      includeFounderData ? getCreditSales(db, monthStart) : null,
      includeFounderData ? getCreditLiability(db) : null,
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
    today.degraded ||
    month.degraded ||
    spread30d.degraded ||
    topUsers30d.degraded ||
    daily14d.degraded ||
    fundingMonth.degraded ||
    creditSales?.degraded === true ||
    liability?.degraded === true;

  return {
    today: today.data,
    month: month.data,
    spread30d: spread30d.data,
    topUsers30d: topUsers30d.data,
    daily14d: daily14d.data,
    fundingMonth: fundingMonth.data,
    subscriptions,
    fees,
    creditSales,
    liability,
    userLabels,
    degraded,
  };
}

function StatCard({
  label,
  value,
  sub,
  icon,
  valueClass,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  icon: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={`text-3xl font-bold ${valueClass ?? "text-foreground"}`}>{value}</p>
      <div className="text-xs text-muted-foreground mt-2">{sub}</div>
    </div>
  );
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

  const {
    today, month, spread30d, topUsers30d, daily14d,
    fundingMonth, subscriptions, fees, creditSales, liability,
    userLabels, degraded,
  } = await getFinanceData(isFounder);

  // ── Real revenue, MTD ────────────────────────────────────────────────────
  const subsCollected = subscriptions?.collected ?? {};
  const packsCollected: CurrencyTotals = creditSales ? { usd: creditSales.grossUsd } : {};
  const revenueTotals = sumTotals(subsCollected, packsCollected);
  const revenue = totalsToUsd(revenueTotals);
  const mrr = totalsToUsd(subscriptions?.mrr ?? {});

  // Stripe takes its cut before the money is ours, so it comes off revenue
  // before LLM cost — net revenue is the real top line.
  const feeTotals = sumTotals(fees?.processing ?? {}, fees?.platform ?? {});
  const stripeFees = totalsToUsd(feeTotals);
  const netRevenue = revenue.usd - stripeFees.usd;
  const feeRate = revenue.usd > 0 ? (stripeFees.usd / revenue.usd) * 100 : null;

  const grossProfit = netRevenue - month.platformCostUsd;
  const grossMargin = revenue.usd > 0 ? (grossProfit / revenue.usd) * 100 : null;

  const unrecovered = unrecoveredCostUsd(fundingMonth);
  const consumedCredits = fundingMonth.reduce((total, row) => total + row.billedCredits, 0);
  const maxBucketCost = Math.max(...fundingMonth.map((row) => row.platformCostUsd), 0.000001);
  const maxDailyCost = Math.max(...daily14d.map((d) => d.providerCostUsd), 0.000001);

  const dailyPercent = DAILY_ALERT_USD > 0 ? (today.platformCostUsd / DAILY_ALERT_USD) * 100 : 0;
  const monthlyPercent = MONTHLY_ALERT_USD > 0 ? (month.platformCostUsd / MONTHLY_ALERT_USD) * 100 : 0;

  const revenueNative = nativeBreakdown(revenueTotals);
  const mrrNative = nativeBreakdown(subscriptions?.mrr ?? {});
  const feesNative = nativeBreakdown(feeTotals);
  const unconverted = [...new Set([...revenue.unconverted, ...mrr.unconverted, ...stripeFees.unconverted])];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
          Finances
        </h1>
        <p className="text-muted-foreground">
          {isFounder
            ? "Cash in from subscriptions and credit packs vs what providers charge us"
            : "LLM usage and platform-key cost"}
        </p>
      </div>

      {degraded && (
        <div className="bg-yellow-500/10 border-l-4 border-yellow-500/60 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />
            <div className="ml-3 text-sm text-yellow-700 dark:text-yellow-300">
              <p className="font-medium">Showing approximate numbers</p>
              <p>
                Migration 20260708120000 (billing columns + finance aggregations) or 20260802140000
                (funding split + cash aggregations) is not applied to this database, so some figures
                are computed from a capped raw-row scan.
              </p>
            </div>
          </div>
        </div>
      )}

      {isFounder && subscriptions && !subscriptions.available && (
        <div className="bg-yellow-500/10 border-l-4 border-yellow-500/60 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />
            <div className="ml-3 text-sm text-yellow-700 dark:text-yellow-300">
              <p className="font-medium">Stripe data unavailable</p>
              <p>
                {subscriptions.reason ?? "Stripe did not respond."} Revenue below counts credit-pack
                sales only, so it is a floor — and processing fees are missing entirely, so net
                revenue and gross profit are both overstated.
              </p>
            </div>
          </div>
        </div>
      )}

      {isFounder && (subscriptions?.truncated || fees?.truncated) && (
        <div className="bg-yellow-500/10 border-l-4 border-yellow-500/60 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />
            <div className="ml-3 text-sm text-yellow-700 dark:text-yellow-300">
              <p className="font-medium">Stripe listing was truncated</p>
              <p>
                More than 1,000 subscriptions, invoices or balance transactions matched. Revenue is a
                floor and fees are understated, so gross profit reads high.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Founder headline: real cash in, real cost, real margin. */}
      {isFounder && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              label="Revenue (MTD)"
              value={usd(revenue.usd)}
              icon={<Landmark className="w-5 h-5 text-emerald-500" />}
              sub={
                <>
                  {usd(totalsToUsd(subsCollected).usd)} subscriptions · {usd(creditSales?.grossUsd ?? 0)} credit packs
                  {revenueNative && <div className="mt-0.5 opacity-70">{revenueNative}</div>}
                </>
              }
            />

            <StatCard
              label="Stripe Fees (MTD)"
              value={usd(stripeFees.usd)}
              valueClass="text-orange-600 dark:text-orange-400"
              icon={<CreditCard className="w-5 h-5 text-orange-500" />}
              sub={
                fees?.available === false ? (
                  "unavailable — not deducted below"
                ) : (
                  <>
                    {feeRate === null ? "no payments yet" : `${feeRate.toFixed(1)}% of revenue`}
                    {" · "}
                    {fees?.paymentCount ?? 0} {fees?.paymentCount === 1 ? "payment" : "payments"}
                    {!isZeroTotals(fees?.platform ?? {}) && (
                      <div className="mt-0.5 opacity-70">
                        incl. {usd(totalsToUsd(fees?.platform ?? {}).usd)} Billing/Radar
                      </div>
                    )}
                    {feesNative && <div className="mt-0.5 opacity-70">{feesNative}</div>}
                  </>
                )
              }
            />

            <StatCard
              label="LLM Cost (MTD)"
              value={usd(month.platformCostUsd, 4)}
              icon={<DollarSign className="w-5 h-5 text-red-500" />}
              sub={<>platform-key provider cost · {usd(month.byokCostUsd, 4)} BYOK passthrough</>}
            />

            <StatCard
              label="Gross Profit (MTD)"
              value={usd(grossProfit)}
              valueClass={grossProfit >= 0 ? "text-foreground" : "text-red-500"}
              icon={<TrendingUp className={`w-5 h-5 ${grossProfit >= 0 ? "text-emerald-500" : "text-red-500"}`} />}
              sub={
                grossMargin === null
                  ? "no revenue yet this month"
                  : `${grossMargin.toFixed(1)}% margin · ${usd(netRevenue)} net of Stripe, minus LLM cost`
              }
            />
          </div>

          {/* Say what the margin still leaves out. Deducting Stripe fees makes
              it a real number, but it is not net income — hosting, salaries and
              everything else are still above the line. */}
          <div className="bg-muted/40 rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                Gross profit is revenue minus Stripe fees minus LLM provider cost.
              </span>{" "}
              Stripe fees are the actual amounts taken (read from balance transactions, not a modelled
              2.9% + 30¢), including separately-billed Billing and Radar charges. Hosting, runtime
              infrastructure and every other operating cost are still not deducted.
              {Object.keys(sumTotals(subsCollected, feeTotals)).some((c) => c !== "usd") && (
                <> Non-USD amounts are converted at a static {usdPerEur().toFixed(2)} USD/EUR rate
                  (<code className="text-[11px]">ADMIN_FX_USD_PER_EUR</code>).</>
              )}
              {unconverted.length > 0 && (
                <> <span className="text-yellow-600 dark:text-yellow-400">
                  {unconverted.map((c) => c.toUpperCase()).join(", ")} could not be converted and is excluded.
                </span></>
              )}
            </p>
          </div>

          {/* Credit economics: recurring base, what the plans absorb, what we owe. */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              label="MRR"
              value={usd(mrr.usd)}
              icon={<Repeat className="w-5 h-5 text-blue-500" />}
              sub={
                <>
                  {subscriptions?.activeCount ?? 0} active
                  {(subscriptions?.trialingCount ?? 0) > 0 && ` · ${subscriptions?.trialingCount} trialing`}
                  {(subscriptions?.pastDueCount ?? 0) > 0 && ` · ${subscriptions?.pastDueCount} past due`}
                  {mrrNative && <div className="mt-0.5 opacity-70">{mrrNative}</div>}
                </>
              }
            />
            <StatCard
              label="Unrecovered LLM cost (MTD)"
              value={usd(unrecovered, 4)}
              valueClass={unrecovered > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}
              icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
              sub="free-tier allowance + comped accounts + Genesis — cost with no matching cash inflow"
            />

            <StatCard
              label="Credit liability"
              value={usd(liability?.liabilityUsd ?? 0)}
              icon={<Wallet className="w-5 h-5 text-purple-500" />}
              sub={
                <>
                  {formatCredits(liability?.outstandingCredits ?? 0)} credits held by{" "}
                  {liability?.holderCount ?? 0} {liability?.holderCount === 1 ? "user" : "users"} · paid for, not yet spent
                </>
              }
            />

            <StatCard
              label="Realized credit rate"
              value={`$${(liability?.realizedUsdPer1k ?? 1).toFixed(3)}`}
              icon={<Wallet className="w-5 h-5 text-emerald-500" />}
              sub={
                <>
                  actual cash per 1,000 credits sold · $1.000 nominal, lower with the +5% / +10% bonus packs
                </>
              }
            />
          </div>

          {/* Where consumed credits were funded from — the split the old
              "Revenue = credits/1000" headline erased. */}
          <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Credit consumption by funding source (MTD)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Consuming a credit is not a cash event. Only the top row was ever paid for separately —
                and it was paid at purchase time, not here.
              </p>
            </div>
            {consumedCredits === 0 && fundingMonth.every((row) => row.platformCostUsd === 0) ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">No platform LLM usage this month.</p>
            ) : (
              <div className="divide-y divide-border">
                {fundingMonth.map((row) => {
                  const meta = BUCKET_LABEL[row.bucket];
                  return (
                    <div key={row.bucket} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className={`font-medium ${meta.tone}`}>{meta.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{meta.note}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-foreground">{usd(row.platformCostUsd, 4)}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.bucket === "unbilled"
                              ? "no credits charged"
                              : `${formatCredits(row.billedCredits)} credits · ${row.userCount} ${row.userCount === 1 ? "user" : "users"}`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-primary/60"
                          style={{ width: `${Math.min((row.platformCostUsd / maxBucketCost) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-6 py-3 border-t border-border bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Included-vs-top-up is derived from each user&apos;s current plan allowance, since credits
                drain included-first and reset on the UTC month. Approximate for users who changed
                plan mid-month, since the tier is read as of now rather than as of each call.
                All MTD figures on this page use UTC month boundaries, matching the allowance reset.
              </p>
            </div>
          </div>

          {/* Per-tier subscription breakdown. */}
          {subscriptions?.available && subscriptions.byTier.length > 0 && (
            <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Subscriptions by plan</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Live from Stripe — comped tiers granted by redemption code or admin grant correctly
                  contribute nothing.
                </p>
              </div>
              <div className="divide-y divide-border">
                {subscriptions.byTier.map((row) => (
                  <div key={row.tier} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground capitalize">
                        {row.tier === "plus" ? "Solo" : row.tier === "pro" ? "Team" : row.tier === "builder" ? "Scale" : row.tier}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.subscribers} {row.subscribers === 1 ? "subscriber" : "subscribers"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{usd(totalsToUsd(row.mrr).usd)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                      {nativeBreakdown(row.mrr) && (
                        <p className="text-xs text-muted-foreground">{nativeBreakdown(row.mrr)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Spend vs alert thresholds. */}
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

      {/* Daily cost trend — founder only (carries credit consumption per day). */}
      {isFounder && (
        <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Daily Spend (14 days)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Provider cost, with the credit value deducted from user balances alongside it.
            </p>
          </div>
          <div className="p-6">
            {daily14d.length === 0 ? (
              <p className="text-sm text-muted-foreground">No LLM usage recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {daily14d.map((d) => (
                  <div key={d.day} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{d.day}</span>
                    <div className="h-3 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-3 rounded-full bg-red-500/70"
                        style={{ width: `${Math.min((d.providerCostUsd / maxDailyCost) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="w-52 shrink-0 text-right text-xs text-muted-foreground">
                      {usd(d.providerCostUsd, 4)} cost · {formatCredits(d.billedCredits)} credits consumed
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Model spread — cost for everyone; credit value founder-only.
          There is deliberately no per-model "profit" column: billed_credits is
          ceil(cost x PLATFORM_MARKUP x 1000), so every row would report exactly
          cost x 9 and no model could ever look unprofitable. */}
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Model Spread (30 days)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isFounder
              ? "Cost = platform-key provider cost (ours). Credit value = what was deducted from user balances, a fixed 10x of cost — not revenue."
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
                  {isFounder && <th className="px-4 py-3 font-medium text-right">Credits charged</th>}
                  {isFounder && <th className="px-6 py-3 font-medium text-right">Credit value</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {spread30d.map((row: ModelSpreadRow) => (
                  <tr key={row.model}>
                    <td className="px-6 py-3 font-medium text-foreground">{row.model}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{row.callCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{row.totalTokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-foreground">{usd(row.platformCostUsd, 4)}</td>
                    {isFounder && (
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCredits(row.billedCredits)}</td>
                    )}
                    {isFounder && (
                      <td className="px-6 py-3 text-right text-foreground">{usd(billedUsd(row.billedCredits), 4)}</td>
                    )}
                  </tr>
                ))}
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
                    <p className="text-xs text-muted-foreground">{formatCredits(row.billedCredits)} credits charged</p>
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
