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

  // Collaboration
  maxTeamSeats: number | null;
  maxWorkspaces: number | null;

  // Model credits (operational signal, not code-enforced)
  modelCreditsIncluded: boolean;
}

export const ENTITLEMENTS: Record<Tier, PlanEntitlements> = {
  free: {
    maxPrograms: 2,
    runsPerMonth: 50,
    runHistoryDays: 7,
    genesisUsesPerMonth: 3,
    triggers: { manual: true, cron: true, webhook: false, event: false, program: false },
    byok: false,
    hitlApprovals: false,
    conflictDetection: false,
    priorityExecution: false,
    maxTeamSeats: 1,
    maxWorkspaces: 1,
    modelCreditsIncluded: false,
  },
  plus: {
    maxPrograms: 5,
    runsPerMonth: 75,
    runHistoryDays: 30,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: false, program: false },
    byok: true,
    hitlApprovals: false,
    conflictDetection: false,
    priorityExecution: false,
    maxTeamSeats: 1,
    maxWorkspaces: 1,
    modelCreditsIncluded: false,
  },
  pro: {
    maxPrograms: null,
    runsPerMonth: 500,
    runHistoryDays: 90,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: true, program: true },
    byok: true,
    hitlApprovals: true,
    conflictDetection: true,
    priorityExecution: false,
    maxTeamSeats: 3,
    maxWorkspaces: 3,
    modelCreditsIncluded: true,
  },
  builder: {
    maxPrograms: null,
    runsPerMonth: 2000,
    runHistoryDays: 365,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: true, program: true },
    byok: true,
    hitlApprovals: true,
    conflictDetection: true,
    priorityExecution: true,
    maxTeamSeats: null,
    maxWorkspaces: null,
    modelCreditsIncluded: true,
  },
  unlimited: {
    maxPrograms: null,
    runsPerMonth: null,
    runHistoryDays: null,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: true, program: true },
    byok: true,
    hitlApprovals: true,
    conflictDetection: true,
    priorityExecution: true,
    maxTeamSeats: null,
    maxWorkspaces: null,
    modelCreditsIncluded: true,
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
