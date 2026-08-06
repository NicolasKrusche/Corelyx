import { describe, expect, it } from "vitest";
import {
  creditsForRawUsd,
  estimateGenesisCredits,
  estimateTokens,
  GENESIS_CREDIT_MARKUP,
} from "@/lib/genesis/credit-cost";
import { CREDITS_PER_USD } from "@/lib/credit-packs";

/* Genesis is paid for out of the credit balance rather than a per-plan monthly
   counter. What matters is that the pre-flight estimate is pessimistic enough
   that an expensive model can never overdraw an account. */

const CHEAP = { promptUsdPerToken: 0.15 / 1e6, completionUsdPerToken: 0.6 / 1e6 };
const SONNET = { promptUsdPerToken: 3 / 1e6, completionUsdPerToken: 15 / 1e6 };
const O1_PRO = { promptUsdPerToken: 150 / 1e6, completionUsdPerToken: 600 / 1e6 };

describe("creditsForRawUsd", () => {
  it("applies the Genesis markup on top of the credit rate", () => {
    expect(creditsForRawUsd(1)).toBe(GENESIS_CREDIT_MARKUP * CREDITS_PER_USD);
  });

  it("rounds up so a sub-credit call is never free", () => {
    expect(creditsForRawUsd(0.0000001)).toBe(1);
  });

  it("charges nothing for a zero or unreported cost", () => {
    expect(creditsForRawUsd(0)).toBe(0);
    expect(creditsForRawUsd(Number.NaN)).toBe(0);
    expect(creditsForRawUsd(-5)).toBe(0);
  });

  it("stays below the runtime's 10x execution markup", () => {
    // Genesis is the acquisition funnel — pricing it like production traffic
    // put every mid-tier model out of reach on the smaller plans.
    expect(GENESIS_CREDIT_MARKUP).toBeLessThan(10);
  });
});

describe("estimateGenesisCredits", () => {
  const promptTokens = 11_000;
  const maxOutputTokens = 16_384;

  it("prices the whole prompt plus a full output budget", () => {
    const credits = estimateGenesisCredits({ pricing: CHEAP, promptTokens, maxOutputTokens });
    const expectedUsd =
      promptTokens * CHEAP.promptUsdPerToken + maxOutputTokens * CHEAP.completionUsdPerToken;
    expect(credits).toBe(creditsForRawUsd(expectedUsd));
  });

  it("keeps the standard model within a Free plan's allowance", () => {
    // Free carries 500 included credits and is locked to the default model.
    const credits = estimateGenesisCredits({ pricing: CHEAP, promptTokens, maxOutputTokens })!;
    expect(credits).toBeLessThan(500);
  });

  it("prices the catalog's most expensive model out of every plan", () => {
    // This is the whole point: Scale has the largest allowance at 15,000
    // credits, and one o1-pro generation must still not fit inside it.
    const credits = estimateGenesisCredits({ pricing: O1_PRO, promptTokens, maxOutputTokens })!;
    expect(credits).toBeGreaterThan(15_000);
  });

  it("leaves a mid-tier model usable on a Solo allowance", () => {
    // Solo carries 2,500 credits; a typical Sonnet generation should fit
    // several times over, which the 10x execution markup would not allow.
    const typical = estimateGenesisCredits({
      pricing: SONNET,
      promptTokens: 7_000,
      maxOutputTokens: 6_000,
    })!;
    expect(typical).toBeLessThan(2_500 / 2);
  });

  it("returns null when the model's price is unknown", () => {
    // The caller must treat this as "cannot price", never as free.
    expect(estimateGenesisCredits({ pricing: null, promptTokens, maxOutputTokens })).toBeNull();
  });

  it("treats negative token counts as zero rather than a discount", () => {
    expect(
      estimateGenesisCredits({ pricing: CHEAP, promptTokens: -100, maxOutputTokens: -100 }),
    ).toBe(0);
  });
});

describe("estimateTokens", () => {
  it("approximates four characters per token", () => {
    expect(estimateTokens("a".repeat(4_000))).toBe(1_000);
  });

  it("rounds up so a short prompt still counts", () => {
    expect(estimateTokens("hi")).toBe(1);
    expect(estimateTokens("")).toBe(0);
  });
});
