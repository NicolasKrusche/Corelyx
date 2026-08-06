/**
 * Server-side credit accounting for Genesis generations.
 *
 * Split from credit-cost.ts so the arithmetic stays importable from anywhere
 * (including client components that display an estimate) while the parts that
 * touch the credit ledger stay server-only.
 */
import { getUserCreditBalance, deductUserCredits } from "@/lib/credits";
import { recordLlmUsage, type LlmUsageLike } from "@/lib/llm-usage-log";
import { creditsForRawUsd } from "@/lib/genesis/credit-cost";
import { serverLog } from "@/lib/server-log";

export type GenesisAffordability =
  | { affordable: true; estimatedCredits: number | null; balance: number }
  | { affordable: false; estimatedCredits: number; balance: number };

/**
 * Can this account cover the worst case for the generation it asked for?
 *
 * An unknown estimate (the OpenRouter catalog was unavailable, so the model's
 * price is null) is allowed through as long as the account has *some* balance.
 * Blocking every generation whenever OpenRouter's catalog endpoint is down
 * would be a worse failure than occasionally overshooting a balance by one
 * generation, which the post-call deduction then floors at zero.
 */
export async function checkGenesisAffordability(
  userId: string,
  estimatedCredits: number | null,
): Promise<GenesisAffordability> {
  const { total } = await getUserCreditBalance(userId);

  if (estimatedCredits === null) {
    return { affordable: total > 0, estimatedCredits: null, balance: total } as GenesisAffordability;
  }
  if (total < estimatedCredits) {
    return { affordable: false, estimatedCredits, balance: total };
  }
  return { affordable: true, estimatedCredits, balance: total };
}

/**
 * Charge for a completed Genesis call and log the usage row.
 *
 * Returns the credits actually charged. A deduction that comes back short is
 * logged and swallowed: the model call already happened and the user already
 * has their workflow, so failing here would destroy delivered work to fix a
 * bookkeeping discrepancy. The pre-flight check is what keeps that rare.
 */
export async function chargeGenesisUsage(opts: {
  userId: string;
  workspaceId?: string | null;
  model: string;
  usage: LlmUsageLike;
  billing: "platform" | "byok";
  /** True when a bonus grant funded this generation — no credits are charged. */
  bonusFunded: boolean;
}): Promise<number> {
  const rawUsd = Number(opts.usage?.cost ?? 0);
  const chargeable = opts.billing === "platform" && !opts.bonusFunded;
  const credits = chargeable ? creditsForRawUsd(rawUsd) : 0;

  if (credits > 0) {
    try {
      const ok = await deductUserCredits(opts.userId, credits);
      if (!ok) {
        serverLog({
          level: "warn",
          event: "genesis.credits.deduction_short",
          message: "Genesis call cost more credits than the balance covered.",
          details: { model: opts.model, credits },
        });
      }
    } catch (error) {
      serverLog({
        level: "error",
        event: "genesis.credits.deduction_failed",
        message: "Could not deduct Genesis credits.",
        details: {
          model: opts.model,
          credits,
          error: error instanceof Error ? error.message : "unknown error",
        },
      });
    }
  }

  recordLlmUsage({
    userId: opts.userId,
    workspaceId: opts.workspaceId,
    model: opts.model,
    usage: opts.usage,
    billing: opts.billing,
    source: "genesis",
    billedCredits: credits,
  });

  return credits;
}
