/**
 * Server-side entitlement enforcement.
 * All plan limits and feature gates live here. Pure config is in entitlements.ts.
 */

import { createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
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
}

async function resolveWorkspaceId(userId: string, workspaceId?: string | null): Promise<string | null> {
  if (workspaceId) return workspaceId;
  return (await getActiveWorkspace(userId))?.workspaceId ?? null;
}

async function getBillingScope(userId: string, workspaceId?: string | null): Promise<BillingScope> {
  const serviceClient = createServiceClient();
  const resolvedWorkspaceId = await resolveWorkspaceId(userId, workspaceId);
  const [{ data: profileData }, { data: workspaceData }, { data: authData }] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("tier, bonus_runs, is_beta_tester, genesis_uses_this_month, genesis_month_reset_at")
      .eq("id", userId)
      .single(),
    resolvedWorkspaceId
      ? serviceClient
          .from("workspaces")
          .select("tier, bonus_runs, is_beta_tester, genesis_uses_this_month, genesis_month_reset_at")
          .eq("id", resolvedWorkspaceId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    serviceClient.auth.admin.getUserById(userId),
  ]);

  const billingData = (workspaceData ?? profileData) as {
    tier?: string;
    bonus_runs?: number;
    is_beta_tester?: boolean;
    genesis_uses_this_month?: number;
    genesis_month_reset_at?: string | null;
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

  let programQuery = serviceClient
    .from("programs")
    .select("id");
  programQuery = resolvedWorkspaceId ? programQuery.eq("workspace_id", resolvedWorkspaceId) : programQuery.eq("user_id", userId);
  const { data: programRows } = await programQuery;

  if (!programRows || programRows.length === 0) return 0;

  const programIds = (programRows as { id: string }[]).map((r) => r.id);
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

  if (usesThisMonth >= ent.genesisUsesPerMonth) {
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
      reason: `Genesis AI limit reached (${usesThisMonth}/${ent.genesisUsesPerMonth} this month on ${tierName} plan)`,
      upgradeMessage: `You've used all ${ent.genesisUsesPerMonth} Genesis AI uses this month on the ${tierName} plan. ${nextTierHint}`,
      usesThisMonth,
      maxUses: ent.genesisUsesPerMonth,
    };
  }

  return { allowed: true, usesThisMonth, maxUses: ent.genesisUsesPerMonth };
}

/** Atomically increment genesis uses after a successful genesis call. */
export async function incrementGenesisUses(userId: string, workspaceId?: string | null): Promise<void> {
  const serviceClient = createServiceClient();
  const resolvedWorkspaceId = await resolveWorkspaceId(userId, workspaceId);
  const table = resolvedWorkspaceId ? "workspaces" : "profiles";
  const idColumn = resolvedWorkspaceId ? "id" : "id";
  const idValue = resolvedWorkspaceId ?? userId;
  const { data: profileData } = await serviceClient
    .from(table)
    .select("genesis_uses_this_month, genesis_month_reset_at")
    .eq(idColumn, idValue)
    .single();

  const resetAt = (profileData as { genesis_month_reset_at?: string | null } | null)?.genesis_month_reset_at ?? null;
  const currentUses = isCurrentMonth(resetAt)
    ? ((profileData as { genesis_uses_this_month?: number } | null)?.genesis_uses_this_month ?? 0)
    : 0;

  await serviceClient
    .from(table)
    .update({
      genesis_uses_this_month: currentUses + 1,
      genesis_month_reset_at: new Date().toISOString(),
    } as never)
    .eq(idColumn, idValue);
}

/** Check whether the user can connect pay-per-use providers (Solo+ only). */
export async function checkPayPerUseConnectorAccess(userId: string, workspaceId?: string | null): Promise<LimitCheckResult> {
  const profile = await getBillingScope(userId, workspaceId);
  const ent = getEntitlements(profile.tier);

  if (ent.payPerUseConnectors) return { allowed: true };

  return {
    allowed: false,
    reason: "Pay-per-use connectors require Solo plan or higher",
    upgradeMessage:
      "Connectors like Stripe, Twilio, OpenAI, and AWS S3 bill your own account per usage. " +
      "They require Solo plan or higher so you can connect them with your own API key. Upgrade to Solo to unlock them.",
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
