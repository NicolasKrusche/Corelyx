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
import type { ModelPricing } from "@/lib/genesis/platform-models";
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
 * What a call actually cost the platform, in USD.
 *
 * OpenRouter reports an exact `cost` when usage accounting is on, and that is
 * the figure to bill from. But it is absent whenever accounting is off, the
 * provider omits it, or a stream ends without a final usage chunk — and reading
 * a missing cost as 0 made the generation free. Falling back to the model's
 * catalog price times the reported tokens keeps those calls billable; only a
 * call that reported neither cost nor tokens comes out at zero.
 */
function rawUsdForUsage(usage: LlmUsageLike, pricing: ModelPricing | null): number {
  const reported = Number(usage?.cost ?? 0);
  if (Number.isFinite(reported) && reported > 0) return reported;
  if (!pricing) return 0;

  const promptTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
  const completionTokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
  const safePrompt = Number.isFinite(promptTokens) ? Math.max(0, promptTokens) : 0;
  const safeCompletion = Number.isFinite(completionTokens) ? Math.max(0, completionTokens) : 0;

  return safePrompt * pricing.promptUsdPerToken + safeCompletion * pricing.completionUsdPerToken;
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
  /** Catalog price for `model`, used when the provider reports no exact cost. */
  pricing?: ModelPricing | null;
  /** True when a bonus grant funded this generation — no credits are charged. */
  bonusFunded: boolean;
}): Promise<number> {
  const chargeable = opts.billing === "platform" && !opts.bonusFunded;
  const rawUsd = rawUsdForUsage(opts.usage, opts.pricing ?? null);
  const credits = chargeable ? creditsForRawUsd(rawUsd) : 0;

  // What the ledger actually moved. deductUserCredits is all-or-nothing — the
  // RPC returns false without writing anything when the balance is short — so
  // recording the intended figure regardless booked revenue that was never
  // collected and overstated the admin finances page.
  let chargedCredits = 0;

  if (credits > 0) {
    try {
      const ok = await deductUserCredits(opts.userId, credits);
      if (ok) {
        chargedCredits = credits;
      } else {
        serverLog({
          level: "warn",
          event: "genesis.credits.deduction_short",
          message: "Genesis call cost more credits than the balance covered; nothing was charged.",
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
    billedCredits: chargedCredits,
  });

  return chargedCredits;
}
