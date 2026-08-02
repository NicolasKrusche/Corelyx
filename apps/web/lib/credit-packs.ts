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

/** Credits granted per USD for a pack — 1,000 base, more on the bonus packs. */
export function creditsPerUsd(pack: CreditPack): number {
  return pack.credits / pack.priceUsd;
}

/** "1,050 credits per $1" — the true rate, for display next to a bonus label. */
export function formatPackRate(pack: CreditPack): string {
  return `${formatCredits(creditsPerUsd(pack))} credits per $1`;
}
