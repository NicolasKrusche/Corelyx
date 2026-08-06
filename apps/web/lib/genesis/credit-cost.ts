/**
 * Pricing a Genesis generation in Corelyx credits.
 *
 * Genesis used to be metered by a per-plan monthly use counter and charged no
 * credits at all (llm_usage_logs.billed_credits was hardcoded to 0). Because
 * paid plans may pick any model in OpenRouter's catalog, and Team/Scale had no
 * use ceiling, a single account could run unlimited generations on the most
 * expensive model in the catalog at platform expense. Credits are now the
 * ceiling, exactly as lib/genesis/platform-models.ts always assumed:
 * "Plan differences are expressed through included credits."
 */
import { CREDITS_PER_USD } from "@/lib/credit-packs";
import type { ModelPricing } from "@/lib/genesis/platform-models";

/**
 * Genesis is charged at a lower markup than workflow execution
 * (PLATFORM_MARKUP = 10 in apps/runtime/engine/executor.py). It is the
 * acquisition funnel — the first thing a new user does — so pricing it like
 * production traffic would put every mid-tier model out of reach on the
 * smaller plans: at 10x, one worst-case Sonnet generation costs more than
 * Solo's entire monthly allowance. At 3x, Solo gets roughly seven of them,
 * while the catalog's priciest models still price themselves out (an o1-pro
 * generation runs to ~34,000 credits, far beyond any plan's allowance).
 */
export const GENESIS_CREDIT_MARKUP = 3;

/** Raw provider cost in USD → the credits the user is charged. */
export function creditsForRawUsd(rawUsd: number): number {
  if (!Number.isFinite(rawUsd) || rawUsd <= 0) return 0;
  return Math.ceil(rawUsd * GENESIS_CREDIT_MARKUP * CREDITS_PER_USD);
}

/**
 * Rough token count for a prompt. ~4 characters per token holds well enough
 * for the English-plus-JSON that Genesis prompts are made of, and this only
 * feeds the pre-flight estimate — the actual charge uses the provider's
 * reported usage.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Worst-case credits for one generation: the whole prompt, plus a completion
 * that runs to the full output budget. Deliberately pessimistic — this gates
 * whether the generation may start, and a caller who cannot afford the worst
 * case should be told before the tokens are spent, not after.
 *
 * Returns null when the model's price is unknown (the OpenRouter catalog was
 * unavailable), which callers must handle rather than treat as free.
 */
export function estimateGenesisCredits(opts: {
  pricing: ModelPricing | null;
  promptTokens: number;
  maxOutputTokens: number;
}): number | null {
  const { pricing, promptTokens, maxOutputTokens } = opts;
  if (!pricing) return null;
  const rawUsd =
    Math.max(0, promptTokens) * pricing.promptUsdPerToken +
    Math.max(0, maxOutputTokens) * pricing.completionUsdPerToken;
  return creditsForRawUsd(rawUsd);
}
