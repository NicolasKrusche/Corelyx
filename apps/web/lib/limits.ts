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

// ─── Internal profile fetch ───────────────────────────────────────────────────

interface UserProfile {
  tier: Tier;
  bonus_runs: number;
  is_beta_tester: boolean;
  genesis_uses_this_month: number;
  genesis_month_reset_at: string | null;
}

async function getUserProfile(userId: string): Promise<UserProfile> {
  const serviceClient = createServiceClient();
  const [{ data: profileData }, { data: authData }] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("tier, bonus_runs, is_beta_tester, genesis_uses_this_month, genesis_month_reset_at")
      .eq("id", userId)
      .single(),
    serviceClient.auth.admin.getUserById(userId),
  ]);

  const tier: Tier = isAdminEmail(authData?.user?.email)
    ? "unlimited"
    : parseTier((profileData as { tier?: string } | null)?.tier);

  return {
    tier,
    bonus_runs: (profileData as { bonus_runs?: number } | null)?.bonus_runs ?? 0,
    is_beta_tester: (profileData as { is_beta_tester?: boolean } | null)?.is_beta_tester ?? false,
    genesis_uses_this_month: (profileData as { genesis_uses_this_month?: number } | null)?.genesis_uses_this_month ?? 0,
    genesis_month_reset_at: (profileData as { genesis_month_reset_at?: string | null } | null)?.genesis_month_reset_at ?? null,
  };
}

/** Count programs owned by a user. */
async function countPrograms(userId: string): Promise<number> {
  const serviceClient = createServiceClient();
  const { count } = await serviceClient
    .from("programs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

/** Count runs started in the current calendar month across all user programs. */
async function countMonthlyRuns(userId: string): Promise<number> {
  const serviceClient = createServiceClient();

  const { data: programRows } = await serviceClient
    .from("programs")
    .select("id")
    .eq("user_id", userId);

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

export async function getRunUsage(userId: string): Promise<{
  current: number;
  total: number | null;
  tier: Tier;
}> {
  const profile = await getUserProfile(userId);
  const ent = getEntitlements(profile.tier);
  const current = await countMonthlyRuns(userId);
  const total =
    ent.runsPerMonth === null
      ? null
      : ent.runsPerMonth + (profile.bonus_runs ?? 0);
  return { current, total, tier: profile.tier };
}

export async function checkProgramLimit(userId: string): Promise<LimitCheckResult> {
  const profile = await getUserProfile(userId);
  const ent = getEntitlements(profile.tier);

  if (ent.maxPrograms === null) return { allowed: true };

  const current = await countPrograms(userId);
  if (current >= ent.maxPrograms) {
    return {
      allowed: false,
      reason: `Program limit reached (${current}/${ent.maxPrograms} on ${profile.tier} plan)`,
      upgradeMessage: `You've reached the ${ent.maxPrograms}-program limit on the Free plan. Upgrade to Solo for unlimited programs.`,
    };
  }

  return { allowed: true };
}

export async function checkRunLimit(userId: string): Promise<LimitCheckResult> {
  const profile = await getUserProfile(userId);
  const ent = getEntitlements(profile.tier);

  if (ent.runsPerMonth === null) return { allowed: true };

  const totalAllowed = ent.runsPerMonth + (profile.bonus_runs ?? 0);
  const current = await countMonthlyRuns(userId);

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
  triggerType: TriggerType
): Promise<LimitCheckResult> {
  const profile = await getUserProfile(userId);
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

export async function checkHITLAccess(userId: string): Promise<LimitCheckResult> {
  const profile = await getUserProfile(userId);
  const ent = getEntitlements(profile.tier);

  if (ent.hitlApprovals) return { allowed: true };

  return {
    allowed: false,
    reason: `Human-in-the-loop approvals require Team plan or higher`,
    upgradeMessage: `Human-in-the-loop approvals are not available on the ${profile.tier} plan. Upgrade to Team.`,
  };
}

export async function checkConflictDetectionAccess(userId: string): Promise<LimitCheckResult> {
  const profile = await getUserProfile(userId);
  const ent = getEntitlements(profile.tier);

  if (ent.conflictDetection) return { allowed: true };

  return {
    allowed: false,
    reason: `Custom conflict policies require Team plan or higher`,
    upgradeMessage: `Custom conflict policies (skip/fail) are not available on the ${profile.tier} plan. Upgrade to Team.`,
  };
}

export async function checkBYOKAccess(userId: string): Promise<LimitCheckResult> {
  const profile = await getUserProfile(userId);
  const ent = getEntitlements(profile.tier);

  if (ent.byok) return { allowed: true };

  return {
    allowed: false,
    reason: `BYOK requires Solo plan or higher`,
    upgradeMessage: `Bring your own API key (BYOK) is not available on the Free plan. Upgrade to Solo.`,
  };
}

/** Check genesis access and return current usage stats. */
export async function checkGenesisAccess(userId: string): Promise<
  LimitCheckResult & { usesThisMonth: number; maxUses: number | null }
> {
  const profile = await getUserProfile(userId);
  const ent = getEntitlements(profile.tier);

  if (ent.genesisUsesPerMonth === null) {
    return { allowed: true, usesThisMonth: 0, maxUses: null };
  }

  const usesThisMonth = isCurrentMonth(profile.genesis_month_reset_at)
    ? profile.genesis_uses_this_month
    : 0;

  if (usesThisMonth >= ent.genesisUsesPerMonth) {
    return {
      allowed: false,
      reason: `Genesis AI limit reached (${usesThisMonth}/${ent.genesisUsesPerMonth} this month on Free plan)`,
      upgradeMessage: `You've used all ${ent.genesisUsesPerMonth} Genesis AI uses this month on the Free plan. Upgrade to Solo for unlimited Genesis.`,
      usesThisMonth,
      maxUses: ent.genesisUsesPerMonth,
    };
  }

  return { allowed: true, usesThisMonth, maxUses: ent.genesisUsesPerMonth };
}

/** Atomically increment genesis uses after a successful genesis call. */
export async function incrementGenesisUses(userId: string): Promise<void> {
  const serviceClient = createServiceClient();
  const { data: profileData } = await serviceClient
    .from("profiles")
    .select("genesis_uses_this_month, genesis_month_reset_at")
    .eq("id", userId)
    .single();

  const resetAt = (profileData as { genesis_month_reset_at?: string | null } | null)?.genesis_month_reset_at ?? null;
  const currentUses = isCurrentMonth(resetAt)
    ? ((profileData as { genesis_uses_this_month?: number } | null)?.genesis_uses_this_month ?? 0)
    : 0;

  await serviceClient
    .from("profiles")
    .update({
      genesis_uses_this_month: currentUses + 1,
      genesis_month_reset_at: new Date().toISOString(),
    } as never)
    .eq("id", userId);
}

/** Return how many days of run history this user is entitled to (null = unlimited). */
export async function getRunHistoryDays(userId: string): Promise<number | null> {
  const profile = await getUserProfile(userId);
  return getEntitlements(profile.tier).runHistoryDays;
}
