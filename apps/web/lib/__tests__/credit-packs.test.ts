import { describe, expect, it } from "vitest";
import {
  CREDIT_PACKS,
  CREDIT_PACK_AMOUNTS,
  creditsPerUsd,
  findCreditPack,
  formatCredits,
  formatPackRate,
} from "../credit-packs";

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

  it("exposes buyable amounts derived from the packs, in pack order", () => {
    expect(CREDIT_PACK_AMOUNTS).toEqual([5_000, 10_000, 26_250, 55_000]);
  });

  it("reports the true rate, which the bonus packs push above 1,000 per dollar", () => {
    // The base packs are exactly the nominal rate; the bonus packs are not, and
    // any dollar valuation of a credit balance has to account for that.
    expect(creditsPerUsd(CREDIT_PACKS[0])).toBe(1_000);
    expect(creditsPerUsd(CREDIT_PACKS[1])).toBe(1_000);
    expect(creditsPerUsd(CREDIT_PACKS[2])).toBe(1_050);
    expect(creditsPerUsd(CREDIT_PACKS[3])).toBe(1_100);
  });

  it("labels the rate for display next to the bonus badge", () => {
    expect(formatPackRate(CREDIT_PACKS[0])).toBe("1,000 credits per $1");
    expect(formatPackRate(CREDIT_PACKS[3])).toBe("1,100 credits per $1");
  });

  it("keeps every advertised bonus consistent with the credits actually granted", () => {
    // A bonus label that disagrees with the credits is a pricing lie; pin them
    // together so changing one without the other fails here.
    const bonusPercent = (pack: (typeof CREDIT_PACKS)[number]) =>
      Math.round((pack.credits / (pack.priceUsd * 1_000) - 1) * 100);
    for (const pack of CREDIT_PACKS) {
      if (pack.bonusLabel === null) {
        expect(bonusPercent(pack)).toBe(0);
      } else {
        expect(pack.bonusLabel).toBe(`+${bonusPercent(pack)}% bonus`);
      }
    }
  });
});
