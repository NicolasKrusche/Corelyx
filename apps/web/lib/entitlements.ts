/**
 * Single source of truth for plan entitlements.
 * Pure config — no DB access. All async enforcement lives in limits.ts.
 */

export type Tier = "free" | "plus" | "pro" | "builder" | "unlimited";

export type TriggerType = "manual" | "cron" | "webhook" | "event" | "program";

export interface TriggerEntitlements {
  manual: boolean;
  cron: boolean;
  webhook: boolean;
  event: boolean;
  program: boolean;
}

export interface PlanEntitlements {
  // Quantitative limits (null = unlimited)
  maxPrograms: number | null;
  runsPerMonth: number | null;
  runHistoryDays: number | null;
  genesisUsesPerMonth: number | null;

  // Trigger access
  triggers: TriggerEntitlements;

  // Feature flags
  byok: boolean;
  hitlApprovals: boolean;
  conflictDetection: boolean;
  priorityExecution: boolean;
  // One-time AI agents (plan a task, approve, run once). Solo and above.
  agents: boolean;

  // Corelyx Desktop: pair a device and let workflows/agents act on local files
  // (the `file` connector + device management). Paid feature, Solo and above —
  // the privacy/governance moat ("files never leave the machine, fully audited").
  localFiles: boolean;

  // Collaboration
  maxTeamSeats: number | null;
  maxWorkspaces: number | null;

  // Pay-per-use connectors (Stripe, Twilio, OpenAI, etc.) — requires own API key/OAuth account
  payPerUseConnectors: boolean;

  // Platform AI credits included per month (null = unlimited, 0 = none).
  //
  // 1,000 credits = $1 of billed value (the pack price) and the runtime bills a
  // 10x markup over provider cost, so an allowance costs credits/10/1000 in real
  // terms — Solo's 2,500 is $0.25 at *full* use. These are small on purpose;
  // BYOK is the intended path for heavy use.
  //
  // If they ever need raising, raise them — don't cut PLATFORM_MARKUP. The
  // markup is our margin on credit packs (10x => ~90%); the allowance is
  // marketing spend we set per tier. Cutting the markup to 3x would take pack
  // margin to ~67% across every credit ever sold, to buy the same headroom.
  includedAiCredits: number | null;

  // Which tier of platform Genesis models the user can access
  // "free"     → only free/open-weight models (Qwen3 Coder)
  // "standard" → + Claude 3 Haiku, GPT-4o Mini  (Solo)
  // "premium"  → + Claude Sonnet, GPT-4o         (Team / Scale)
  genesisPlatformModelTier: "free" | "standard" | "premium";

  // Genesis V2 (live connector introspection, patch-based edits, clarifying
  // questions). Defaults to a strong model, so it's gated to the top plan(s)
  // for now; dev accounts also get access for testing (see lib/genesis/v2-access).
  genesisV2: boolean;
}

export const ENTITLEMENTS: Record<Tier, PlanEntitlements> = {
  free: {
    maxPrograms: 2,
    runsPerMonth: 50,
    runHistoryDays: 7,
    genesisUsesPerMonth: 3,
    triggers: { manual: true, cron: true, webhook: false, event: false, program: false },
    byok: false,
    payPerUseConnectors: false,
    hitlApprovals: true,
    conflictDetection: false,
    priorityExecution: false,
    agents: false,
    localFiles: false,
    maxTeamSeats: 1,
    maxWorkspaces: 1,
    includedAiCredits: 0,
    genesisPlatformModelTier: "free",
    genesisV2: false,
  },
  plus: {   // Solo
    maxPrograms: 5,
    runsPerMonth: 75,
    runHistoryDays: 30,
    genesisUsesPerMonth: 5,
    triggers: { manual: true, cron: true, webhook: true, event: false, program: false },
    byok: true,
    payPerUseConnectors: true,
    hitlApprovals: true,
    conflictDetection: false,
    priorityExecution: false,
    agents: true,
    localFiles: true,
    maxTeamSeats: 1,
    maxWorkspaces: 1,
    includedAiCredits: 2_500,
    genesisPlatformModelTier: "standard",
    genesisV2: false,
  },
  pro: {   // Team
    maxPrograms: null,
    runsPerMonth: 500,
    runHistoryDays: 90,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: true, program: true },
    byok: true,
    payPerUseConnectors: true,
    hitlApprovals: true,
    conflictDetection: true,
    priorityExecution: false,
    agents: true,
    localFiles: true,
    maxTeamSeats: 3,
    maxWorkspaces: 3,
    includedAiCredits: 10_000,
    genesisPlatformModelTier: "premium",
    genesisV2: false,
  },
  builder: {   // Scale
    maxPrograms: null,
    runsPerMonth: 2000,
    runHistoryDays: 365,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: true, program: true },
    byok: true,
    payPerUseConnectors: true,
    hitlApprovals: true,
    conflictDetection: true,
    priorityExecution: true,
    agents: true,
    localFiles: true,
    maxTeamSeats: null,
    maxWorkspaces: null,
    includedAiCredits: 15_000,
    genesisPlatformModelTier: "premium",
    genesisV2: true,
  },
  unlimited: {
    maxPrograms: null,
    runsPerMonth: null,
    runHistoryDays: null,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: true, program: true },
    byok: true,
    payPerUseConnectors: true,
    hitlApprovals: true,
    conflictDetection: true,
    priorityExecution: true,
    agents: true,
    localFiles: true,
    maxTeamSeats: null,
    maxWorkspaces: null,
    includedAiCredits: null,
    genesisPlatformModelTier: "premium",
    genesisV2: true,
  },
};

export function getEntitlements(tier: Tier): PlanEntitlements {
  return ENTITLEMENTS[tier];
}

export function hasTriggerAccess(tier: Tier, triggerType: TriggerType): boolean {
  return ENTITLEMENTS[tier].triggers[triggerType];
}

export function parseTier(value: string | null | undefined): Tier {
  if (
    value === "free" || value === "plus" || value === "pro" ||
    value === "builder" || value === "unlimited"
  ) return value;
  return "free";
}
