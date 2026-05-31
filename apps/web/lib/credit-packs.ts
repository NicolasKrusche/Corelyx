export const CREDIT_PACKS = [
  { credits: 5_000, priceUsd: 5, bonusLabel: null },
  { credits: 10_000, priceUsd: 10, bonusLabel: null },
  { credits: 26_250, priceUsd: 25, bonusLabel: "+5% bonus" },
  { credits: 55_000, priceUsd: 50, bonusLabel: "+10% bonus" },
] as const;

export type CreditPack = (typeof CREDIT_PACKS)[number];

export function findCreditPack(credits: number): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.credits === credits);
}

export function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}
