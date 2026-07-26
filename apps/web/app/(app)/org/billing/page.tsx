"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  Zap,
  AlertCircle,
  Check,
  ArrowUpRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

type Plan = {
  id: string;
  name: string;
  slug: string;
  seat_price_monthly: number;
  included_seats: number;
  execution_price_per_minute: number;
  included_execution_minutes: number;
  byok_platform_fee_monthly: number;
  features: string[];
  sort_order: number;
};

type Subscription = {
  id: string;
  org_id: string;
  plan_id: string;
  billing_mode: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  seats_count: number;
  // Read below to decide whether to show the Stripe portal link.
  stripe_customer_id: string | null;
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

type UsageResponse = {
  usage: UsageSummary;
  plan: {
    name: string;
    slug: string;
    included_seats: number;
    included_execution_minutes: number;
    execution_price_per_minute: number;
    period_start: string;
    period_end: string;
  } | null;
};

type SubResponse = {
  subscription: Subscription;
  plan: Plan | null;
  org: { id: string; name: string; slug: string };
};

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#f97316", "#eab308"];

function StatCard({
  label,
  value,
  sub,
  icon,
  color = "text-primary",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={color}>{icon}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function BillingPage() {
  const [subData, setSubData] = useState<SubResponse | null>(null);
  const [usageData, setUsageData] = useState<UsageResponse | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [subRes, usageRes, plansRes] = await Promise.all([
        fetch("/api/billing/subscription"),
        fetch("/api/billing/usage"),
        fetch("/api/billing/plans"),
      ]);

      if (subRes.ok) {
        const data = await subRes.json();
        setSubData(data);
      }
      if (usageRes.ok) {
        const data = await usageRes.json();
        setUsageData(data);
      }
      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans ?? []);
      }

      // Check URL params for success/cancel
      const params = new URLSearchParams(window.location.search);
      if (params.get("upgraded") === "true") {
        setStatus({ type: "success", message: "Subscription updated successfully!" });
        window.history.replaceState({}, "", "/org/billing");
      } else if (params.get("canceled") === "true") {
        window.history.replaceState({}, "", "/org/billing");
      }
    } catch (err) {
      setStatus({ type: "error", message: "Failed to load billing data." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpgrade = async (planSlug: string, billingMode: string = "managed") => {
    if (!subData?.org?.id) return;
    setUpgrading(planSlug);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: subData.org.id,
          plan_slug: planSlug,
          billing_mode: billingMode,
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      if (res.ok) {
        setStatus({ type: "success", message: `Switched to ${planSlug} plan.` });
        loadData();
      } else {
        setStatus({ type: "error", message: data.error || "Failed to update plan." });
      }
    } catch {
      setStatus({ type: "error", message: "Failed to update plan." });
    } finally {
      setUpgrading(null);
    }
  };

  const currentPlan = subData?.plan;
  const usage = usageData?.usage;
  const planLimits = usageData?.plan;

  // Calculate usage percentages
  const minutesUsed = usage?.total_minutes ?? 0;
  const minutesLimit = planLimits?.included_execution_minutes ?? 60;
  const minutesPercent = minutesLimit > 0 ? Math.min((minutesUsed / minutesLimit) * 100, 100) : 0;
  const isOverLimit = minutesUsed > minutesLimit;

  if (loading) {
    return (
      <div className="max-w-5xl space-y-4">
        <h1 className="text-3xl font-black tracking-tight">Billing</h1>
        <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p className="text-sm">Loading billing data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
            Billing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your subscription, view usage, and upgrade your plan.
          </p>
        </div>
        {currentPlan && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {currentPlan.name} Plan
            </span>
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
              {subData?.subscription?.billing_mode === "byok" ? "BYOK" : "Managed"}
            </span>
          </div>
        )}
      </div>

      {status && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            status.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
          }`}
        >
          {status.message}
        </div>
      )}

      {/* Current Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Execution Minutes"
          value={`${minutesUsed.toFixed(1)}m`}
          sub={`${minutesLimit}m included · ${isOverLimit ? "Over limit!" : `${(minutesLimit - minutesUsed).toFixed(1)}m remaining`}`}
          icon={<Zap className="h-5 w-5" />}
          color={isOverLimit ? "text-red-500" : "text-primary"}
        />
        <StatCard
          label="Tokens Used"
          value={usage ? usage.total_tokens.toLocaleString() : "0"}
          sub={`${usage?.record_count ?? 0} runs this period`}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <StatCard
          label="Estimated Cost"
          value={`$${(usage?.total_cost ?? 0).toFixed(2)}`}
          sub="Raw provider cost"
          icon={<CreditCard className="h-5 w-5" />}
        />
        <StatCard
          label="Period"
          value={planLimits?.period_end ? new Date(planLimits.period_end).toLocaleDateString() : "—"}
          sub={planLimits?.period_start ? `Started ${new Date(planLimits.period_start).toLocaleDateString()}` : undefined}
          icon={<FileText className="h-5 w-5" />}
        />
      </div>

      {/* Usage Progress Bar */}
      {planLimits && (
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Execution Minutes Usage</h3>
            <span className="text-xs text-muted-foreground">
              {minutesUsed.toFixed(1)} / {minutesLimit} minutes
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isOverLimit ? "bg-red-500" : minutesPercent > 80 ? "bg-yellow-500" : "bg-primary"
              }`}
              style={{ width: `${Math.min(minutesPercent, 100)}%` }}
            />
          </div>
          {isOverLimit && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="h-3 w-3" />
              <span>You&apos;ve exceeded your included execution minutes. Upgrade to avoid overage charges.</span>
            </div>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Usage Chart */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-sm font-semibold">Execution Minutes (Daily)</h3>
          {usage?.daily && usage.daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={usage.daily}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(2)} min`, "Minutes"]}
                  labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
                />
                <Bar dataKey="minutes" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <p className="text-sm">No usage data yet</p>
            </div>
          )}
        </div>

        {/* Cost by Model Chart */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-sm font-semibold">Cost by Model</h3>
          {usage?.by_model && usage.by_model.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={usage.by_model}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="cost"
                  nameKey="model"
                  paddingAngle={2}
                >
                  {usage.by_model.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]}
                />
                <Legend
                  formatter={(value) => String(value).split("/").pop() ?? String(value)}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <p className="text-sm">No model data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Cost Trend Chart */}
      {usage?.daily && usage.daily.length > 1 && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-sm font-semibold">Cost Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={usage.daily}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]}
                labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
              />
              <Line type="monotone" dataKey="cost" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Model Usage Breakdown Table */}
      {usage?.by_model && usage.by_model.length > 0 && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-sm font-semibold">Usage by Model</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Model</th>
                  <th className="pb-2 text-right font-medium">Runs</th>
                  <th className="pb-2 text-right font-medium">Minutes</th>
                  <th className="pb-2 text-right font-medium">Tokens</th>
                  <th className="pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.by_model.map((m) => (
                  <tr key={m.model} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{m.model || "unknown"}</td>
                    <td className="py-2 text-right">{m.count}</td>
                    <td className="py-2 text-right">{m.minutes.toFixed(2)}</td>
                    <td className="py-2 text-right">{m.tokens.toLocaleString()}</td>
                    <td className="py-2 text-right font-medium">${m.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Plan Upgrade/Downgrade */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isCurrent = currentPlan?.slug === plan.slug;
            return (
              <div
                key={plan.slug}
                className={`rounded-lg border p-6 space-y-4 transition-all ${
                  isCurrent
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "bg-card hover:border-muted-foreground/30"
                }`}
              >
                <div>
                  <h3 className="font-semibold">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {plan.byok_platform_fee_monthly > 0
                      ? `€${plan.byok_platform_fee_monthly}/mo BYOK`
                      : plan.seat_price_monthly > 0
                        ? `€${plan.seat_price_monthly}/mo`
                        : "Free"}
                  </p>
                </div>

                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-500 shrink-0" />
                    {plan.included_seats} seat{plan.included_seats !== 1 ? "s" : ""}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-500 shrink-0" />
                    {plan.included_execution_minutes} min included
                  </li>
                  {plan.execution_price_per_minute > 0 && (
                    <li className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-green-500 shrink-0" />
                      €{plan.execution_price_per_minute}/min overage
                    </li>
                  )}
                  {plan.byok_platform_fee_monthly > 0 && (
                    <li className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-green-500 shrink-0" />
                      BYOK: pay your own LLM costs
                    </li>
                  )}
                  {plan.features.slice(0, 3).map((feat) => (
                    <li key={feat} className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-green-500 shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="text-center text-sm font-medium text-primary py-2">
                    Current Plan
                  </div>
                ) : (
                  <button
                    onClick={() => handleUpgrade(plan.slug)}
                    disabled={upgrading === plan.slug}
                    className={`w-full rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                      plans.indexOf(plan) > (plans.findIndex((p) => p.slug === currentPlan?.slug) ?? 0)
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-border hover:bg-muted"
                    } disabled:opacity-50`}
                  >
                    {upgrading === plan.slug ? (
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    ) : plans.indexOf(plan) > (plans.findIndex((p) => p.slug === currentPlan?.slug) ?? 0) ? (
                      <span className="flex items-center justify-center gap-1">
                        Upgrade <ArrowUpRight className="h-3 w-3" />
                      </span>
                    ) : (
                      "Switch Plan"
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stripe Portal Link */}
      {subData?.subscription?.stripe_customer_id && (
        <div className="rounded-lg border bg-card p-6 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Payment & Invoices</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Manage payment methods, view invoices, and update billing details.
            </p>
          </div>
          <a
            href={`/api/billing/portal?org_id=${subData.org.id}`}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Stripe Portal
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
