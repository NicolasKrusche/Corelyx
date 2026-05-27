import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getUserCreditBalance } from "@/lib/credits";
import { getEntitlements, parseTier } from "@/lib/entitlements";
import { getRunUsage, checkGenesisAccess } from "@/lib/limits";
import { getActiveWorkspace } from "@/lib/workspaces";
import { CreditsTopUp, PastPurchasesLink } from "./credits-topup";
import { AutoRechargeSettings } from "./auto-recharge-settings";
import { UsageCharts } from "@/components/usage-charts";
import { getUsageHistory } from "@/lib/usage-history";
import { getTranslations } from "next-intl/server";
import { Download, History, Rocket, Plus, Check, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/admin";
import { PlanPreviewToggle } from "./plan-preview-toggle";

export const metadata: Metadata = { title: "Credits & Usage — Corelyx" };

const TIER_LABEL: Record<string, string> = {
  free: "Free", plus: "Solo", pro: "Team", builder: "Scale", unlimited: "Unlimited",
};

function StatBar({ value, max, color = "bg-primary" }: { value: number; max: number | null; color?: string }) {
  const pct = max === null ? 100 : Math.min(100, (value / max) * 100);
  const isWarn = max !== null && pct >= 80 && pct < 100;
  const isOver = max !== null && pct >= 100;
  return (
    <div className="mt-2 h-1 w-full rounded-full bg-white/20">
      <div
        className={`h-full rounded-full transition-all ${isOver ? "bg-red-400" : isWarn ? "bg-yellow-400" : color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatBarMuted({ value, max }: { value: number; max: number | null }) {
  const pct = max === null ? 100 : Math.min(100, (value / max) * 100);
  const isWarn = max !== null && pct >= 80 && pct < 100;
  const isOver = max !== null && pct >= 100;
  return (
    <div className="mt-2 h-1 w-full rounded-full bg-border">
      <div
        className={`h-full rounded-full transition-all ${isOver ? "bg-destructive" : isWarn ? "bg-yellow-500" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type CreditPurchase = {
  id: string;
  amount_usd: number;
  created_at: string;
  stripe_session_id: string | null;
};

export default async function CreditsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();
  const [ws, profileRes, resolvedParams] = await Promise.all([
    getActiveWorkspace(user.id),
    service.from("profiles").select("tier, stripe_payment_method_id, is_admin").eq("id", user.id).single(),
    searchParams,
  ]);

  const profileData = profileRes.data as { tier?: string; stripe_payment_method_id?: string | null; is_admin?: boolean } | null;
  const isAdmin = isAdminEmail(user.email ?? undefined) || profileData?.is_admin === true;
  const realTier = isAdmin ? "unlimited" : parseTier(profileData?.tier);

  // Dev-only plan preview — only admins can use ?preview_tier=xxx
  const VALID_TIERS = ["free", "plus", "pro", "builder", "unlimited"] as const;
  type ValidTier = typeof VALID_TIERS[number];
  const previewParam = resolvedParams.preview_tier as string | undefined;
  const previewTier = isAdmin && previewParam && (VALID_TIERS as readonly string[]).includes(previewParam)
    ? previewParam as ValidTier
    : null;
  const tier = previewTier ?? realTier;

  const hasSavedPaymentMethod = Boolean(profileData?.stripe_payment_method_id);
  const ent = getEntitlements(tier);
  const workspaceId = ws?.workspaceId ?? null;

  const t = await getTranslations("credits");

  const [creditBalance, runUsage, genesisAccess, usageHistory, apiKeysRes, purchasesRes] = await Promise.all([
    getUserCreditBalance(user.id),
    getRunUsage(user.id, workspaceId),
    checkGenesisAccess(user.id, workspaceId),
    getUsageHistory(user.id, workspaceId),
    service.from("api_keys").select("id, name", { count: "exact" }).eq("workspace_id", workspaceId ?? "").limit(5),
    service.from("credit_purchases").select("id, amount_usd, created_at, stripe_session_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);

  const isUnlimited = tier === "unlimited" || creditBalance.total === Infinity;
  const includedTotal = ent.includedAiCreditsUsd;
  const includedUsed = includedTotal === null ? 0 : Math.max(0, includedTotal - creditBalance.availableIncluded);

  // When previewing a plan, substitute limits from entitlements so the display
  // reflects the selected plan rather than the user's real DB-stored limits.
  const runsTotal = previewTier !== null ? ent.runsPerMonth : runUsage.total;
  const genesisTotal = previewTier !== null ? ent.genesisUsesPerMonth : genesisAccess.maxUses;

  const runsLeft = runsTotal === null ? null : Math.max(0, runsTotal - runUsage.current);
  const genesisLeft = genesisTotal === null ? null : Math.max(0, genesisTotal - genesisAccess.usesThisMonth);
  const apiKeyCount = apiKeysRes.count ?? 0;
  const purchases = (purchasesRes.data ?? []) as CreditPurchase[];

  // Cycle info
  const now = new Date();
  const cycleStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const cycleEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const daysInCycle = cycleEnd.getUTCDate();
  const currentDay = now.getUTCDate();
  const daysRemaining = daysInCycle - currentDay;
  const cycleStartLabel = cycleStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const cycleEndLabel = cycleEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const shortWsId = workspaceId ? `wks_${workspaceId.replace(/-/g, "").slice(0, 4)}-${workspaceId.replace(/-/g, "").slice(4, 8)}` : null;

  // Burn rate
  const spentThisCycle = includedUsed + usageHistory.reduce((s, d) => s + d.cost_usd, 0);
  const burnRate = currentDay > 1 ? spentThisCycle / currentDay : 0;

  // Activity ledger entries
  type LedgerEntry = {
    date: string;
    label: string;
    sub: string;
    amount: string | null;
    type: string;
    balance: string;
    typeColor: string;
  };

  const ledger: LedgerEntry[] = purchases.map((p) => ({
    date: p.created_at.slice(0, 10),
    label: "Credit top-up",
    sub: `Stripe · ${p.stripe_session_id?.slice(0, 12) ?? "—"}`,
    amount: `+$${p.amount_usd.toFixed(2)}`,
    type: "Purchase",
    balance: `$${(creditBalance.availablePurchased).toFixed(2)}`,
    typeColor: "bg-green-500/10 text-green-600",
  }));

  // Plan data for the PLANS section
  const tierOrder = ["free", "plus", "pro", "builder"] as const;
  const currentTierIdx = tierOrder.indexOf(tier as typeof tierOrder[number]);

  const PLANS = [
    {
      id: "plus" as const,
      label: "SOLO",
      price: "€9.90",
      period: "/month",
      features: [
        "5 programs",
        "75 runs / month",
        "All 200+ connectors",
        "BYOK (bring your own API key)",
        "€2.50 platform AI credits / month",
        "5 Genesis AI uses / month",
        "30-day run history",
        "Webhook triggers",
        "Email support",
      ],
      cta: tier === "plus" ? "Current plan" : currentTierIdx > 1 ? "Downgrade" : "Upgrade to Solo",
      checkout: tier === "free" ? { tier: "plus", interval: "month" } : undefined,
      href: tier === "plus" ? undefined : currentTierIdx > 1 ? "/dashboard" : undefined,
      primary: false,
      current: tier === "plus",
      badge: tier === "plus" ? "CURRENT" : null,
    },
    {
      id: "pro" as const,
      label: "TEAM",
      price: "€19.90",
      period: "/month",
      features: [
        "Everything in Solo, plus:",
        "Unlimited programs",
        "Up to 3 team seats",
        "Human-in-the-loop approvals",
        "500 runs / month",
        "€10 platform AI credits / month",
        "90-day run history",
        "All trigger types",
        "Priority support",
      ],
      cta: tier === "pro" ? "Current plan" : currentTierIdx > 2 ? "Downgrade" : "Upgrade to Team",
      checkout: currentTierIdx <= 1 ? { tier: "pro", interval: "month" } : undefined,
      href: tier === "pro" ? undefined : currentTierIdx > 2 ? "/dashboard" : undefined,
      primary: true,
      current: tier === "pro",
      badge: "MOST POPULAR",
    },
    {
      id: "builder" as const,
      label: "SCALE",
      price: "€49.90",
      period: "/month",
      features: [
        "Everything in Team, plus:",
        "Unlimited team seats",
        "2,000 runs / month",
        "€15 platform AI credits / month",
        "1-year run history",
        "Priority execution queue",
        "Dedicated success manager",
        "Custom integrations",
        "SLA guarantee",
      ],
      cta: tier === "builder" ? "Current plan" : "Contact sales",
      href: tier === "builder" ? undefined : "mailto:sales@corelyx.app",
      primary: false,
      current: tier === "builder",
      badge: null,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-2">

      {/* ── Header ── */}
      <div>
        {isAdmin && (
          <div className="mb-3">
            <PlanPreviewToggle current={tier} />
          </div>
        )}
        <p className="mb-1 text-[11px] text-muted-foreground/60">
          <Link href="/settings" className="hover:text-foreground transition-colors">Settings</Link>
          {" / "}
          <span>Billing</span>
          {" / "}
          <span>Credits & Usage</span>
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight">{t("title")}</h1>
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {TIER_LABEL[tier]} plan
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Cycle {cycleStartLabel} — {cycleEndLabel}
              {" · "}Next reset in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}
              {shortWsId && <> · <span className="font-mono text-xs">{shortWsId}</span></>}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export invoice
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/runs">
                <History className="h-3.5 w-3.5 mr-1.5" />
                Usage logs
              </Link>
            </Button>
            {!isUnlimited && (
              <Button asChild size="sm" className="gap-1.5">
                <Link href="/plan">
                  <Rocket className="h-3.5 w-3.5" />
                  Upgrade plan
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Balance + Cycle Allowance ── */}
      <div className="grid gap-4 lg:grid-cols-5">

        {/* Wallet Balance — purple card */}
        <div className="relative overflow-hidden rounded-2xl bg-[hsl(var(--primary))] p-6 text-primary-foreground lg:col-span-3">
          <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -bottom-10 -right-4 h-32 w-32 rounded-full bg-white/5" />

          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Wallet Balance</p>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold">
              {TIER_LABEL[tier]} plan
            </span>
          </div>

          <p className="mt-2 text-4xl font-black tracking-tight">
            {isUnlimited ? "∞" : `$${creditBalance.total.toFixed(2)}`}
          </p>

          {!isUnlimited && (
            <div className="mt-5 grid grid-cols-4 gap-3">
              {[
                { label: "INCLUDED", value: `$${creditBalance.availableIncluded.toFixed(2)}` },
                { label: "TOP-UP BALANCE", value: `$${creditBalance.availablePurchased.toFixed(2)}` },
                { label: "SPENT THIS CYCLE", value: `$${spentThisCycle.toFixed(4)}` },
                { label: "EST. BURN RATE", value: burnRate > 0 ? `$${burnRate.toFixed(4)}/day` : "$0.00 / day" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[9px] font-bold uppercase tracking-wider opacity-60">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {!isUnlimited && (
              <>
                <Link
                  href="#topup"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-semibold hover:bg-white/20 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add credits
                </Link>
                <Link
                  href="/plan"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-semibold hover:bg-white/20 transition-colors"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Upgrade plan
                </Link>
              </>
            )}
            <Link
              href="#activity"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-semibold hover:bg-white/20 transition-colors"
            >
              View activity
            </Link>
          </div>
        </div>

        {/* This Cycle's Allowance */}
        <div className="rounded-2xl border glass-panel p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              This Cycle&apos;s Allowance
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              {cycleStartLabel} → {cycleEndLabel.split(" ")[1]} · day {currentDay} of {daysInCycle}
            </p>
          </div>

          <div className="space-y-4">
            {/* Platform AI */}
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-primary"><path d="M6 1l1.2 3.6L11 6l-3.8 1.4L6 11 4.8 7.4 1 6l3.8-1.4L6 1Z" fill="currentColor" opacity="0.8"/></svg>
                  Platform AI
                </span>
                <span className={`text-xs ${includedTotal === 0 ? "text-muted-foreground" : ""}`}>
                  {includedTotal === null ? "unlimited" : includedTotal === 0 ? "not included" : `$${includedUsed.toFixed(2)} / $${includedTotal.toFixed(2)}`}
                </span>
              </div>
              {includedTotal === 0 ? (
                <Link href="/plan" className="mt-1 block text-[11px] text-primary hover:underline">
                  Available on Pro plan and above →
                </Link>
              ) : includedTotal !== null ? (
                <StatBarMuted value={includedUsed} max={includedTotal} />
              ) : (
                <div className="mt-2 h-1 w-full rounded-full bg-primary/30">
                  <div className="h-full w-full rounded-full bg-primary" />
                </div>
              )}
            </div>

            {/* Genesis AI */}
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-violet-500"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 6h4M6 4v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  Genesis AI
                </span>
                <span className="text-xs">
                  {genesisAccess.usesThisMonth} / {genesisTotal === null ? "unlimited" : genesisTotal}
                </span>
              </div>
              <StatBarMuted value={genesisAccess.usesThisMonth} max={genesisTotal} />
              <p className="mt-1 text-[11px] text-muted-foreground/60">
                {genesisAccess.usesThisMonth} generation{genesisAccess.usesThisMonth !== 1 ? "s" : ""} used in {now.toLocaleDateString("en-US", { month: "long" })}
              </p>
            </div>

            {/* Workflow runs */}
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-blue-500"><rect x="1" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/><rect x="7" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/><rect x="7" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/></svg>
                  Workflow runs
                </span>
                <span className="text-xs">
                  {runUsage.current} / {runsTotal === null ? "unlimited" : runsTotal}
                </span>
              </div>
              <StatBarMuted value={runUsage.current} max={runsTotal} />
              <p className="mt-1 text-[11px] text-muted-foreground/60">
                {runUsage.current} run{runUsage.current !== 1 ? "s" : ""} this cycle
              </p>
            </div>

            {/* BYOK */}
            {ent.byok && (
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-emerald-500"><circle cx="5" cy="7" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M7.5 4.5L11 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M9 3l1 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    Bring-your-own-key (BYOK)
                  </span>
                  <span className="text-xs font-semibold">{apiKeyCount} key{apiKeyCount !== 1 ? "s" : ""}</span>
                </div>
                <div className="mt-2 h-1 w-full rounded-full bg-border">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, apiKeyCount * 25)}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground/60">
                  {apiKeyCount === 0 ? "No API keys connected" : `${apiKeyCount} key${apiKeyCount !== 1 ? "s" : ""} connected · all healthy`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Charts ── */}
      <UsageCharts history={usageHistory} />

      {/* ── Top up + Auto-recharge ── */}
      {!isUnlimited && (
        <div id="topup" className="grid gap-4 lg:grid-cols-2">
          {/* Top up */}
          <section className="rounded-2xl border glass-panel p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-1.5 font-semibold">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  {t("topUp")}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("topUpDesc")}</p>
              </div>
              <PastPurchasesLink />
            </div>
            <CreditsTopUp />
          </section>

          {/* Auto-recharge + Budget alerts */}
          <div className="space-y-4">
            <AutoRechargeSettings hasSavedPaymentMethod={hasSavedPaymentMethod} />

            <section className="rounded-2xl border glass-panel p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-amber-500"><path d="M7 2L2 11h10L7 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M7 6v2.5M7 10v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    Budget alerts
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Email {user.email?.split("@")[0] ?? "you"} at 50%, 80%, 100% of monthly budget.
                  </p>
                </div>
                <Link href="/settings" className="text-xs text-primary hover:underline">Configure →</Link>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ── Plans ── */}
      {isUnlimited ? (
        <section className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 flex items-center gap-4">
          <span className="text-2xl leading-none">∞</span>
          <div>
            <p className="text-sm font-semibold text-foreground">Unlimited access</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              This account has unrestricted access to all Corelyx features — no plan limits apply.
            </p>
          </div>
        </section>
      ) : (
      <section>
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Plans</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Upgrade to unlock Platform AI, higher rate limits, and team features.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.primary
                  ? "border-primary glass-card shadow-md shadow-primary/10"
                  : plan.current
                  ? "glass-card"
                  : "glass-card"
              }`}
            >
              {plan.badge && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide ${plan.primary ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"}`}>
                  {plan.badge}
                </span>
              )}

              <p className={`text-[11px] font-bold uppercase tracking-widest ${plan.primary ? "text-primary" : "text-muted-foreground"}`}>
                {plan.label}
              </p>

              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-black">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>

              <ul className="mt-4 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${plan.primary ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={f.includes("not included") ? "text-muted-foreground/60" : ""}>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {plan.current && !plan.checkout ? (
                  <div className="flex items-center justify-center rounded-xl border border-border py-2.5 text-sm text-muted-foreground">
                    You&apos;re here
                  </div>
                ) : plan.checkout ? (
                  <form action="/api/billing/checkout" method="POST">
                    <input type="hidden" name="tier" value={plan.checkout.tier} />
                    <input type="hidden" name="interval" value={plan.checkout.interval} />
                    <button
                      type="submit"
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Rocket className="h-3.5 w-3.5" />
                      {plan.cta}
                    </button>
                  </form>
                ) : (
                  <Link
                    href={plan.href ?? "/plan"}
                    className="flex items-center justify-center rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* ── Activity Ledger ── */}
      <section id="activity">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="flex items-center gap-1.5 font-semibold">
                <History className="h-4 w-4 text-muted-foreground" />
                Activity ledger
              </p>
              {ledger.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{ledger.length} entries</span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">Every credit purchase and balance change.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              CSV
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border glass-panel">
          {/* Table header */}
          <div className="hidden grid-cols-[120px_1fr_100px_80px_100px_24px] gap-4 border-b border-border/60 px-5 py-2.5 sm:grid">
            {["DATE", "EVENT", "AMOUNT", "TYPE", "BALANCE"].map((h) => (
              <p key={h} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{h}</p>
            ))}
          </div>

          {ledger.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">No activity yet.</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Credit purchases and cycle resets will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {ledger.map((entry) => (
                <div key={entry.date + entry.label} className="grid grid-cols-1 gap-1 px-5 py-3.5 transition-colors hover:bg-accent/20 sm:grid-cols-[120px_1fr_100px_80px_100px_24px] sm:items-center sm:gap-4">
                  <p className="font-mono text-xs text-muted-foreground">{entry.date}</p>
                  <div>
                    <p className="text-sm font-medium">{entry.label}</p>
                    <p className="text-[11px] text-muted-foreground/60">{entry.sub}</p>
                  </div>
                  <p className="font-mono text-sm font-semibold text-green-600">{entry.amount ?? "—"}</p>
                  <span className={`inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${entry.typeColor}`}>
                    {entry.type}
                  </span>
                  <p className="font-mono text-sm">{entry.balance}</p>
                  <ArrowUpRight className="hidden h-3.5 w-3.5 text-muted-foreground/40 sm:block" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
