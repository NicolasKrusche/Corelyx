import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getUserCreditBalance } from "@/lib/credits";
import { getEntitlements, parseTier } from "@/lib/entitlements";
import { getRunUsage, checkGenesisAccess } from "@/lib/limits";
import { getActiveWorkspace } from "@/lib/workspaces";
import { CreditsTopUp } from "./credits-topup";

export const metadata: Metadata = { title: "Credits & Usage — Corelyx" };

const TIER_LABEL: Record<string, string> = {
  free: "Free", plus: "Solo", pro: "Team", builder: "Scale", unlimited: "Unlimited",
};

function StatBar({ value, max }: { value: number; max: number | null }) {
  const pct = max === null ? 100 : Math.min(100, (value / max) * 100);
  const isWarn = max !== null && pct >= 80 && pct < 100;
  const isOver = max !== null && pct >= 100;
  return (
    <div className="mt-3 h-1 w-full rounded-full bg-border">
      <div
        className={`h-full rounded-full transition-all ${isOver ? "bg-destructive" : isWarn ? "bg-yellow-500" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default async function CreditsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();
  const [ws, profileRes] = await Promise.all([
    getActiveWorkspace(user.id),
    service.from("profiles").select("tier").eq("id", user.id).single(),
  ]);

  const tier = parseTier((profileRes.data as { tier?: string } | null)?.tier);
  const ent = getEntitlements(tier);
  const workspaceId = ws?.workspaceId ?? null;

  const [creditBalance, runUsage, genesisAccess] = await Promise.all([
    getUserCreditBalance(user.id),
    getRunUsage(user.id, workspaceId),
    checkGenesisAccess(user.id, workspaceId),
  ]);

  const isUnlimited = creditBalance.total === Infinity;
  const includedTotal = ent.includedAiCreditsUsd;
  const includedUsed = includedTotal === null ? 0 : Math.max(0, includedTotal - creditBalance.availableIncluded);
  const runsLeft = runUsage.total === null ? null : Math.max(0, runUsage.total - runUsage.current);
  const genesisLeft = genesisAccess.maxUses === null ? null : Math.max(0, genesisAccess.maxUses - genesisAccess.usesThisMonth);

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-2">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Credits & Usage</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {TIER_LABEL[tier]} plan ·{" "}
            <Link href="/plan" className="text-primary hover:underline underline-offset-2">
              Upgrade
            </Link>
          </p>
        </div>
      </div>

      {/* Balance hero */}
      <div className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-10 -right-4 h-32 w-32 rounded-full bg-white/5" />
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70">Total available</p>
        <p className="mt-1 text-4xl font-black tracking-tight">
          {isUnlimited ? "Unlimited" : `$${creditBalance.total.toFixed(2)}`}
        </p>
        {!isUnlimited && (
          <div className="mt-4 flex items-center gap-4 text-sm">
            <span className="opacity-80">
              <span className="font-semibold opacity-100">${creditBalance.availableIncluded.toFixed(2)}</span>
              {" "}included
            </span>
            {creditBalance.availablePurchased > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span className="opacity-80">
                  <span className="font-semibold opacity-100">${creditBalance.availablePurchased.toFixed(2)}</span>
                  {" "}purchased
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Usage stats grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* AI credits */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Platform AI</p>
          {isUnlimited ? (
            <p className="mt-2 text-lg font-bold">Unlimited</p>
          ) : includedTotal === 0 ? (
            <>
              <p className="mt-2 text-lg font-bold">—</p>
              <p className="mt-1 text-xs text-muted-foreground">Not on Free plan</p>
              <Link href="/plan" className="mt-2 block text-xs font-medium text-primary hover:underline">Upgrade →</Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-bold">
                ${includedUsed.toFixed(2)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ ${includedTotal?.toFixed(2)}</span>
              </p>
              <StatBar value={includedUsed} max={includedTotal} />
              <p className="mt-2 text-xs text-muted-foreground">Used this month</p>
            </>
          )}
        </div>

        {/* Genesis */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Genesis AI</p>
          {genesisAccess.maxUses === null ? (
            <>
              <p className="mt-2 text-lg font-bold">Unlimited</p>
              <p className="mt-1 text-xs text-muted-foreground">Uses this month</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-bold">
                {genesisAccess.usesThisMonth}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ {genesisAccess.maxUses}</span>
              </p>
              <StatBar value={genesisAccess.usesThisMonth} max={genesisAccess.maxUses} />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Used this month</p>
                {genesisLeft === 0 && (
                  <Link href="/plan" className="text-xs font-medium text-primary hover:underline">Upgrade →</Link>
                )}
              </div>
            </>
          )}
        </div>

        {/* Runs */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Workflow Runs</p>
          {runUsage.total === null ? (
            <>
              <p className="mt-2 text-lg font-bold">Unlimited</p>
              <p className="mt-1 text-xs text-muted-foreground">Runs this month</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-bold">
                {runUsage.current}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ {runUsage.total}</span>
              </p>
              <StatBar value={runUsage.current} max={runUsage.total} />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Used this month</p>
                {runsLeft === 0 && (
                  <Link href="/plan" className="text-xs font-medium text-primary hover:underline">Upgrade →</Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top up */}
      {!isUnlimited && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">Top up credits</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Purchased credits never expire and are used after your monthly allowance runs out.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <CreditsTopUp />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            $1 ≈ a few hundred LLM calls depending on model. Used only when workflows run via the Corelyx platform key.
          </p>
        </section>
      )}

      {/* Pools breakdown */}
      {!isUnlimited && (includedTotal ?? 0) > 0 && (
        <section className="rounded-2xl border border-border bg-card divide-y divide-border">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="text-sm font-medium">Included credits</p>
              <p className="text-xs text-muted-foreground">Resets monthly with your plan</p>
            </div>
            <span className="text-sm font-semibold">${creditBalance.availableIncluded.toFixed(2)} left</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="text-sm font-medium">Purchased credits</p>
              <p className="text-xs text-muted-foreground">Never expire</p>
            </div>
            <span className="text-sm font-semibold">${creditBalance.availablePurchased.toFixed(2)}</span>
          </div>
        </section>
      )}

    </div>
  );
}
