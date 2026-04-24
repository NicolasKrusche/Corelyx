/**
 * Usage limit helpers.
 * Centralises tier limits and the DB queries needed to enforce them.
 */

import { createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";

type Tier = "free" | "pro" | "builder" | "unlimited";

interface TierLimits {
  maxPrograms: number | null;  // null = unlimited
  runsPerMonth: number | null; // null = unlimited
}

const TIER_LIMITS: Record<Tier, TierLimits> = {
  free:      { maxPrograms: 2,    runsPerMonth: 50   },
  pro:       { maxPrograms: null, runsPerMonth: 500  },
  builder:   { maxPrograms: null, runsPerMonth: 2000 },
  unlimited: { maxPrograms: null, runsPerMonth: null },
};

interface UserProfile {
  tier: Tier;
  bonus_runs: number;
  is_beta_tester: boolean;
}

/** Fetch the user's profile tier + bonuses. Falls back to free on error. */
async function getUserProfile(userId: string): Promise<UserProfile> {
  const serviceClient = createServiceClient();
  const [{ data: profileData }, { data: authData }] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("tier, bonus_runs, is_beta_tester")
      .eq("id", userId)
      .single(),
    serviceClient.auth.admin.getUserById(userId),
  ]);

  const tier: Tier = isAdminEmail(authData?.user?.email)
    ? "unlimited"
    : ((profileData?.tier as Tier) ?? "free");

  return {
    tier,
    bonus_runs: (profileData?.bonus_runs as number) ?? 0,
    is_beta_tester: (profileData?.is_beta_tester as boolean) ?? false,
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

  // Get all program IDs owned by the user
  const { data: programRows } = await serviceClient
    .from("programs")
    .select("id")
    .eq("user_id", userId);

  if (!programRows || programRows.length === 0) return 0;

  const programIds = (programRows as { id: string }[]).map((r) => r.id);

  // Start of current UTC month
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { count } = await serviceClient
    .from("runs")
    .select("id", { count: "exact", head: true })
    .in("program_id", programIds)
    .gte("started_at", monthStart);

  return count ?? 0;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  /** Human-readable upgrade message for API consumers */
  upgradeMessage?: string;
  /** True when this run crossed the 80% threshold — caller should send a warning email */
  warnAt80Percent?: boolean;
  /** Current count after this run (for warning email context) */
  currentCount?: number;
  /** Total allowed (for warning email context) */
  totalAllowed?: number;
}

/**
 * Return current month run usage for display in the UI.
 */
export async function getRunUsage(userId: string): Promise<{
  current: number;
  total: number | null;
  tier: Tier;
}> {
  const profile = await getUserProfile(userId);
  const limits = TIER_LIMITS[profile.tier];
  const current = await countMonthlyRuns(userId);
  const total = limits.runsPerMonth === null
    ? null
    : limits.runsPerMonth + (profile.bonus_runs ?? 0);
  return { current, total, tier: profile.tier };
}

/**
 * Check if the user can create another program.
 * Call before inserting a new program row.
 */
export async function checkProgramLimit(userId: string): Promise<LimitCheckResult> {
  const profile = await getUserProfile(userId);
  const limits = TIER_LIMITS[profile.tier];

  if (limits.maxPrograms === null) return { allowed: true };

  const current = await countPrograms(userId);
  if (current >= limits.maxPrograms) {
    return {
      allowed: false,
      reason: `Program limit reached (${current}/${limits.maxPrograms} on ${profile.tier} plan)`,
      upgradeMessage: `You've reached the ${limits.maxPrograms}-program limit on the Free plan. Upgrade to Pro for unlimited programs.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if the user can start another run this month.
 * Call before inserting a new run row.
 */
export async function checkRunLimit(userId: string): Promise<LimitCheckResult> {
  const profile = await getUserProfile(userId);
  const limits = TIER_LIMITS[profile.tier];

  if (limits.runsPerMonth === null) return { allowed: true };

  const totalAllowed = limits.runsPerMonth + (profile.bonus_runs ?? 0);
  const current = await countMonthlyRuns(userId);

  if (current >= totalAllowed) {
    return {
      allowed: false,
      reason: `Monthly run limit reached (${current}/${totalAllowed} on ${profile.tier} plan)`,
      upgradeMessage:
        profile.tier === "free"
          ? `You've used all ${totalAllowed} runs this month on the Free plan. Upgrade to Pro for 500 runs/month.`
          : `You've used all ${totalAllowed} runs this month on the ${profile.tier} plan. Upgrade for more.`,
    };
  }

  // Warn at 80% — only when this run crosses the threshold, not on every run above it
  const afterThis = current + 1;
  const warnAt80Percent =
    afterThis / totalAllowed >= 0.8 && current / totalAllowed < 0.8;

  return { allowed: true, warnAt80Percent, currentCount: afterThis, totalAllowed };
}
