import { describe, expect, it } from "vitest";
import { CREDIT_PACKS, findCreditPack, formatCredits } from "../credit-packs";

describe("credit packs", () => {
  it("maps checkout prices to integer credits including advertised bonuses", () => {
    expect(CREDIT_PACKS).toEqual([
      { credits: 5_000, priceUsd: 5, bonusLabel: null },
      { credits: 10_000, priceUsd: 10, bonusLabel: null },
      { credits: 26_250, priceUsd: 25, bonusLabel: "+5% bonus" },
      { credits: 55_000, priceUsd: 50, bonusLabel: "+10% bonus" },
    ]);
  });

  it("finds packs by credited amount", () => {
    expect(findCreditPack(10_000)?.priceUsd).toBe(10);
    expect(findCreditPack(25_000)).toBeUndefined();
  });

  it("formats credits as whole units", () => {
    expect(formatCredits(2_500)).toBe("2,500");
  });
});
