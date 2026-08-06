/**
 * Top-up packs. The base rate is 1,000 credits per USD; the $25 and $50 packs
 * grant bonus credits on top, so their realized rate is 1,050 and 1,100 credits
 * per USD. That is intentional — the bonus is the incentive to buy bigger.
 *
 * Consequence to keep in mind anywhere credits are valued in dollars: a credit
 * is NOT uniformly worth $0.001. Bonus-pack credits were bought at ~$0.00091.
 * User-facing surfaces quote the pack price (exact, from priceUsd); finance
 * surfaces value outstanding credits at the blended realized rate instead of
 * the nominal one (see admin_credit_liability in migration 20260802140000).
 */
export const CREDIT_PACKS = [
  { credits: 5_000, priceUsd: 5, bonusLabel: null },
  { credits: 10_000, priceUsd: 10, bonusLabel: null },
  { credits: 26_250, priceUsd: 25, bonusLabel: "+5% bonus" },
  { credits: 55_000, priceUsd: 50, bonusLabel: "+10% bonus" },
] as const;

export type CreditPack = (typeof CREDIT_PACKS)[number];

/** Credit amounts that can be bought, in pack order. */
export const CREDIT_PACK_AMOUNTS = CREDIT_PACKS.map((pack) => pack.credits);

export function findCreditPack(credits: number): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.credits === credits);
}

export function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}

/**
 * Consumption rate: usage is always charged at 1,000 credits per $1 of billed
 * cost, whatever the credit cost to acquire. The bonus packs above move the
 * *purchase* rate only — so the billed USD columns (runs.billed_cost_usd,
 * node_executions.billed_cost_usd, llm_usage_logs.billed_credits / 1000)
 * convert back to credits exactly.
 */
export const CREDITS_PER_USD = 1_000;

/** Billed USD → credits. Exact for platform-billed usage; BYOK/free rows carry
 *  raw pass-through provider cost, so their credit figure is nominal. */
export function usdToCredits(billedUsd: number): number {
  return billedUsd * CREDITS_PER_USD;
}

/**
 * Credit amount for display. A single charge is a whole credit, but totals and
 * averages are fractional — keep a little precision on small values instead of
 * rounding a real cost down to a flat "0".
 */
export function formatCreditAmount(credits: number): string {
  if (!Number.isFinite(credits) || credits === 0) return "0";
  const abs = Math.abs(credits);
  const decimals = abs < 1 ? 2 : abs < 100 ? 1 : 0;
  // Round first, then let toLocaleString drop a trailing ".0" — a chart axis of
  // "30.0, 60.0, 90.0, 120" reads worse than "30, 60, 90, 120".
  return Number(credits.toFixed(decimals)).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
}

/** Billed USD → credits, formatted for display. 0.0152 → "15.2". */
export function formatUsdAsCredits(billedUsd: number): string {
  return formatCreditAmount(usdToCredits(billedUsd));
}

/** Credits granted per USD for a pack — 1,000 base, more on the bonus packs. */
export function creditsPerUsd(pack: CreditPack): number {
  return pack.credits / pack.priceUsd;
}

/** "1,050 credits per $1" — the true rate, for display next to a bonus label. */
export function formatPackRate(pack: CreditPack): string {
  return `${formatCredits(creditsPerUsd(pack))} credits per $1`;
}
