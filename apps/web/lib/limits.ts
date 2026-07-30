/**
 * Server-side entitlement enforcement.
 * All plan limits and feature gates live here. Pure config is in entitlements.ts.
 */

import { createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { serverLog } from "@/lib/server-log";
import { connectorRequiresPaidPlan } from "@/lib/connector-tiers";
import {
  getEntitlements,
  parseTier,
  type Tier,
  type TriggerType,
} from "@/lib/entitlements";
import { getActiveWorkspace } from "@/lib/workspaces";

// ─── Internal profile fetch ───────────────────────────────────────────────────

interface BillingScope {
  workspaceId: string | null;
  tier: Tier;
  bonus_runs: number;
  is_beta_tester: boolean;
  genesis_uses_this_month: number;
  genesis_month_reset_at: string | null;
  /** One-time Genesis grants (redemption code type `genesis_uses`). Unlike
   *  bonus_runs this is a depleting pool, not a monthly top-up. */
  bonus_genesis_uses: number;
}

async function resolveWorkspaceId(userId: string, workspaceId?: string | null): Promise<string | null> {
  if (workspaceId) return workspaceId;
  return (await getActiveWorkspace(userId))?.workspaceId ?? null;
}

async function getBillingScope(userId: string, workspaceId?: string | null): Promise<BillingScope> {
  const serviceClient = createServiceClient();
  const resolvedWorkspaceId = await resolveWorkspaceId(userId, workspaceId);
  const [profileResult, workspaceResult, { data: authData }] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("tier, bonus_runs, is_beta_tester, genesis_uses_this_month, genesis_month_reset_at, bonus_genesis_uses")
      .eq("id", userId)
      .single(),
    resolvedWorkspaceId
      ? serviceClient
          .from("workspaces")
          .select("tier, bonus_runs, is_beta_tester, genesis_uses_this_month, genesis_month_reset_at, bonus_genesis_uses")
          .eq("id", resolvedWorkspaceId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    serviceClient.auth.admin.getUserById(userId),
  ]);
  const { data: profileData } = profileResult;
  const { data: workspaceData } = workspaceResult;

  // A failed select here (e.g. a billing column missing from the deployed DB)
  // would silently downgrade the user to the "free" tier. Losing the real tier
  // must at least be visible in server logs.
  const billingReadError = ("error" in workspaceResult && workspaceResult.error) || profileResult.error;
  if (billingReadError && !workspaceData && !profileData) {
    serverLog({
      level: "error",
      event: "limits.billing_scope.read_failed",
      message: "Billing scope select failed; user will be treated as free tier unless ADMIN_EMAILS matches.",
      details: { code: billingReadError.code ?? null },
    });
  }

  const billingData = (workspaceData ?? profileData) as {
    tier?: string;
    bonus_runs?: number;
    is_beta_tester?: boolean;
    genesis_uses_this_month?: number;
    genesis_month_reset_at?: string | null;
    bonus_genesis_uses?: number;
  } | null;

  const tier: Tier = isAdminEmail(authData?.user?.email)
    ? "unlimited"
    : parseTier(billingData?.tier);

  return {
    workspaceId: resolvedWorkspaceId,
    tier,
    bonus_runs: billingData?.bonus_runs ?? 0,
    is_beta_tester: billingData?.is_beta_tester ?? false,
    genesis_uses_this_month: billingData?.genesis_uses_this_month ?? 0,
    genesis_month_reset_at: billingData?.genesis_month_reset_at ?? null,
    bonus_genesis_uses: billingData?.bonus_genesis_uses ?? 0,
  };
}

/** Count programs in a workspace. */
async function countPrograms(userId: string, workspaceId?: string | null): Promise<number> {
  const serviceClient = createServiceClient();
  const resolvedWorkspaceId = await resolveWorkspaceId(userId, workspaceId);
  let query = serviceClient
    .from("programs")
    .select("id", { count: "exact", head: true });
  query = resolvedWorkspaceId ? query.eq("workspace_id", resolvedWorkspaceId) : query.eq("user_id", userId);
  const { count } = await query;
  return count ?? 0;
}

/** Count runs started in the current calendar month across workspace programs. */
async function countMonthlyRuns(userId: string, workspaceId?: string | null): Promise<number> {
  const serviceClient = createServiceClient();
  const resolvedWorkspaceId = await resolveWorkspaceId(userId, workspaceId);

  // Paginate the program-id fetch: a plain select truncates at PostgREST's
  // 1000-row default, so a workspace with >1000 programs would undercount its
  // monthly runs and never hit the run limit. Range through every page.
  const PAGE_SIZE = 1000;
  const programIds: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let programQuery = serviceClient
      .from("programs")
      .select("id")
      .range(from, from + PAGE_SIZE - 1);
    programQuery = resolvedWorkspaceId ? programQuery.eq("workspace_id", resolvedWorkspaceId) : programQuery.eq("user_id", userId);
    const { data: programRows } = await programQuery;
    const page = (programRows ?? []) as { id: string }[];
    programIds.push(...page.map((r) => r.id));
    if (page.length < PAGE_SIZE) break;
  }

  if (programIds.length === 0) return 0;

  const monthStart = utcMonthStart();

  const { count } = await serviceClient
    .from("runs")
    .select("id", { count: "exact", head: true })
    .in("program_id", programIds)
    .gte("started_at", monthStart);

  return count ?? 0;
}

function utcMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function isCurrentMonth(isoTimestamp: string | null): boolean {
  if (!isoTimestamp) return false;
  const d = new Date(isoTimestamp);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

// ─── Genesis allowance arithmetic ─────────────────────────────────────────────

/*
 * A `genesis_uses` redemption code grants a one-time pool (bonus_genesis_uses)
 * on top of the plan's monthly allowance. The two rules below are what keep it
 * one-time, and they have to agree:
 *
 *   - the plan allowance is always spent first, so genesis_uses_this_month
 *     pins at the plan limit and the pool only drains after that;
 *   - the ceiling is plan + whatever is left in the pool, so it shrinks as the
 *     pool empties and lands back on the bare plan limit once it is gone.
 *
 * Spending the pool first would instead let it refill on every monthly reset,
 * turning a campaign grant into a permanent entitlement. This differs from
 * bonus_runs, which checkRunLimit deliberately re-adds every month.
 */

/** Genesis uses allowed this month for a capped plan, given the bonus left. */
export function genesisCeiling(planPerMonth: number, bonusRemaining: number): number {
  return planPerMonth + Math.max(0, bonusRemaining);
}

/** Which bucket the next Genesis use comes out of. */
export function genesisSpendTarget(
  planPerMonth: number | null,
  usedThisMonth: number,
  bonusRemaining: number
): "plan" | "bonus" {
  const planExhausted = planPerMonth !== null && usedThisMonth >= planPerMonth;
  return planExhausted && bonusRemaining > 0 ? "bonus" : "plan";
}

// ─── Public result type ───────────────────────────────────────────────────────

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  upgradeMessage?: string;
  /** True when this run crossed the 80% threshold — caller should send a warning email */
  warnAt80Percent?: boolean;
  currentCount?: number;
  totalAllowed?: number;
}

// ─── Quantitative limits ──────────────────────────────────────────────────────

export async function getRunUsage(userId: string, workspaceId?: string | null): Promise<{
  current: number;
  total: number | null;
  tier: Tier;
}> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);
  const current = await countMonthlyRuns(userId, profile.workspaceId);
  const total =
    ent.runsPerMonth === null
      ? null
      : ent.runsPerMonth + (profile.bonus_runs ?? 0);
  return { current, total, tier: profile.tier };
}

export async function checkProgramLimit(userId: string, workspaceId?: string | null): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.maxPrograms === null) return { allowed: true };

  const current = await countPrograms(userId, profile.workspaceId);
  if (current >= ent.maxPrograms) {
    return {
      allowed: false,
      reason: `Program limit reached (${current}/${ent.maxPrograms} on ${profile.tier} plan)`,
      upgradeMessage: `You've reached the ${ent.maxPrograms}-program limit on the Free plan. Upgrade to Solo for unlimited programs.`,
    };
  }

  return { allowed: true };
}

export async function checkRunLimit(userId: string, workspaceId?: string | null): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.runsPerMonth === null) return { allowed: true };

  const totalAllowed = ent.runsPerMonth + (profile.bonus_runs ?? 0);
  const current = await countMonthlyRuns(userId, profile.workspaceId);

  if (current >= totalAllowed) {
    const upgradeMessage =
      profile.tier === "free"
        ? `You've used all ${totalAllowed} runs this month on the Free plan. Upgrade to Solo for 75 runs/month.`
        : profile.tier === "plus"
        ? `You've used all ${totalAllowed} runs this month on the Solo plan. Upgrade to Team for 500 runs/month.`
        : `You've used all ${totalAllowed} runs this month on the ${profile.tier} plan. Upgrade for more.`;

    return {
      allowed: false,
      reason: `Monthly run limit reached (${current}/${totalAllowed} on ${profile.tier} plan)`,
      upgradeMessage,
    };
  }

  const afterThis = current + 1;
  const warnAt80Percent =
    afterThis / totalAllowed >= 0.8 && current / totalAllowed < 0.8;

  return { allowed: true, warnAt80Percent, currentCount: afterThis, totalAllowed };
}

// ─── Feature gates ────────────────────────────────────────────────────────────

export async function checkTriggerAccess(
  userId: string,
  triggerType: TriggerType,
  workspaceId?: string | null
): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.triggers[triggerType]) return { allowed: true };

  const tierNeeded =
    triggerType === "webhook" ? "Solo" :
    triggerType === "event" || triggerType === "program" ? "Team" : "Solo";

  return {
    allowed: false,
    reason: `${triggerType} triggers require ${tierNeeded} plan or higher`,
    upgradeMessage: `${triggerType} triggers are not available on the ${profile.tier} plan. Upgrade to ${tierNeeded}.`,
  };
}

export async function checkHITLAccess(userId: string, workspaceId?: string | null): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.hitlApprovals) return { allowed: true };

  return {
    allowed: false,
    reason: `Human-in-the-loop approvals require Team plan or higher`,
    upgradeMessage: `Human-in-the-loop approvals are not available on the ${profile.tier} plan. Upgrade to Team.`,
  };
}

export async function checkConflictDetectionAccess(userId: string, workspaceId?: string | null): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.conflictDetection) return { allowed: true };

  return {
    allowed: false,
    reason: `Custom conflict policies require Team plan or higher`,
    upgradeMessage: `Custom conflict policies (skip/fail) are not available on the ${profile.tier} plan. Upgrade to Team.`,
  };
}

export async function checkAgentAccess(userId: string, workspaceId?: string | null): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.agents) return { allowed: true };

  return {
    allowed: false,
    reason: "AI agents require Solo plan or higher",
    upgradeMessage:
      "One-time AI agents are not available on the Free plan. Upgrade to Solo to plan, approve, and run agents.",
  };
}

export async function checkLocalFilesAccess(userId: string, workspaceId?: string | null): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.localFiles) return { allowed: true };

  return {
    allowed: false,
    reason: "Corelyx Desktop requires Solo plan or higher",
    upgradeMessage:
      "Pairing a device to act on local files is not available on the Free plan. Upgrade to Solo to use the Corelyx desktop app.",
  };
}

export async function checkBYOKAccess(userId: string, workspaceId?: string | null): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.byok) return { allowed: true };

  return {
    allowed: false,
    reason: `BYOK requires Solo plan or higher`,
    upgradeMessage: `Bring your own API key (BYOK) is not available on the Free plan. Upgrade to Solo.`,
  };
}

/** Check genesis access and return current usage stats. */
export async function checkGenesisAccess(userId: string, workspaceId?: string | null): Promise<
  LimitCheckResult & { usesThisMonth: number; maxUses: number | null }
> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.genesisUsesPerMonth === null) {
    return { allowed: true, usesThisMonth: 0, maxUses: null };
  }

  const usesThisMonth = isCurrentMonth(profile.genesis_month_reset_at)
    ? profile.genesis_uses_this_month
    : 0;

  const totalAllowed = genesisCeiling(ent.genesisUsesPerMonth, profile.bonus_genesis_uses ?? 0);

  if (usesThisMonth >= totalAllowed) {
    const tierNames: Record<string, string> = {
      free: "Free", plus: "Solo", pro: "Team", builder: "Scale", unlimited: "Unlimited",
    };
    const tierName = tierNames[profile.tier] ?? profile.tier;
    const nextTierHint = profile.tier === "free"
      ? "Upgrade to Solo for more Genesis uses."
      : profile.tier === "plus"
      ? "Upgrade to Team for unlimited Genesis."
      : "Contact support to increase your limit.";
    return {
      allowed: false,
      reason: `Genesis AI limit reached (${usesThisMonth}/${totalAllowed} this month on ${tierName} plan)`,
      upgradeMessage: `You've used all ${totalAllowed} Genesis AI uses this month on the ${tierName} plan. ${nextTierHint}`,
      usesThisMonth,
      maxUses: totalAllowed,
    };
  }

  return { allowed: true, usesThisMonth, maxUses: totalAllowed };
}

/** Record one genesis use after a successful genesis call. */
export async function incrementGenesisUses(userId: string, workspaceId?: string | null): Promise<void> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);
  const serviceClient = createServiceClient();
  const table = profile.workspaceId ? "workspaces" : "profiles";
  const idValue = profile.workspaceId ?? userId;

  const currentUses = isCurrentMonth(profile.genesis_month_reset_at)
    ? profile.genesis_uses_this_month
    : 0;

  const target = genesisSpendTarget(
    ent.genesisUsesPerMonth,
    currentUses,
    profile.bonus_genesis_uses
  );
  if (target === "bonus") {
    await serviceClient
      .from(table)
      .update({ bonus_genesis_uses: profile.bonus_genesis_uses - 1 } as never)
      .eq("id", idValue);
    return;
  }

  await serviceClient
    .from(table)
    .update({
      genesis_uses_this_month: currentUses + 1,
      genesis_month_reset_at: new Date().toISOString(),
    } as never)
    .eq("id", idValue);
}

/**
 * Check whether the user may connect *or execute* a given connector.
 *
 * Connector access is ungated by design — see the policy note in
 * lib/connector-tiers.ts. Only AI-inference connectors are gated, and they ride
 * the BYOK entitlement rather than a separate flag so the three enforcement
 * points (this, /api/keys, and the runtime's `_enforce_agent_model_access`)
 * can't drift into disagreeing about who may run a model on their own key.
 *
 * Takes the provider explicitly: callers must not assume the gate applies to
 * every pay-per-use provider, because it no longer does.
 */
export async function checkConnectorAccess(
  userId: string,
  provider: string,
  workspaceId?: string | null
): Promise<LimitCheckResult> {
  if (!connectorRequiresPaidPlan(provider)) return { allowed: true };

  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.byok) return { allowed: true };

  return {
    allowed: false,
    reason: `${provider} runs AI models on your own API key, which requires the Solo plan or higher`,
    upgradeMessage:
      `Connecting ${provider} lets workflows run AI models on your own API key. ` +
      "That requires the Solo plan or higher. On the Free plan you can still use " +
      "Corelyx's built-in AI with your included credits, and every non-AI connector " +
      "(Stripe, Twilio, AWS, and the rest) is available on every plan.",
  };
}

/** Return how many days of run history this user is entitled to (null = unlimited). */
export async function getRunHistoryDays(userId: string, workspaceId?: string | null): Promise<number | null> {
  const profile = await getBillingScope(userId, workspaceId);
  return getEntitlements(profile.tier).runHistoryDays;
}

/** Return the resolved billing tier for a user (optionally scoped to a workspace). */
export async function getUserTier(userId: string, workspaceId?: string | null): Promise<Tier> {
  const billing = await getBillingScope(userId, workspaceId);
  return billing.tier;
}

/** Count active memberships + pending invitations in a workspace (a seat is held either way). */
async function countTeamSeats(workspaceId: string): Promise<number> {
  const serviceClient = createServiceClient();
  const [{ count: memberCount }, { count: inviteCount }] = await Promise.all([
    serviceClient
      .from("workspace_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    serviceClient
      .from("workspace_invitations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .is("revoked_at", null),
  ]);
  return (memberCount ?? 0) + (inviteCount ?? 0);
}

/** Check whether a workspace can add one more seat (a new member or a new pending invitation). */
export async function checkTeamSeatLimit(userId: string, workspaceId?: string | null): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.maxTeamSeats === null || !profile.workspaceId) return { allowed: true };

  const current = await countTeamSeats(profile.workspaceId);
  if (current >= ent.maxTeamSeats) {
    return {
      allowed: false,
      reason: `Team seat limit reached (${current}/${ent.maxTeamSeats} on ${profile.tier} plan)`,
      upgradeMessage: `You've reached the ${ent.maxTeamSeats}-seat limit on your plan. Upgrade to add more teammates.`,
    };
  }

  return { allowed: true };
}

export async function checkWorkspaceLimit(userId: string): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId);
  const ent = getEntitlements(profile.tier);
  if (ent.maxWorkspaces === null) return { allowed: true };

  const serviceClient = createServiceClient();
  const { count } = await serviceClient
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId);
  const current = count ?? 0;
  if (current >= ent.maxWorkspaces) {
    return {
      allowed: false,
      reason: `Workspace limit reached (${current}/${ent.maxWorkspaces} on ${profile.tier} plan)`,
      upgradeMessage: "Your current plan only allows one workspace. Upgrade to Team or higher to create more workspaces.",
    };
  }
  return { allowed: true };
}
