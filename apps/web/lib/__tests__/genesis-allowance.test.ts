import { describe, expect, it } from "vitest";
import { genesisCeiling, genesisSpendTarget } from "../limits";

/* The `genesis_uses` redemption code (Relay.app migration campaign) grants a
   one-time pool on top of the plan's monthly allowance. These two helpers are
   what make it one-time rather than a permanent monthly uplift. */

describe("genesisCeiling", () => {
  it("is the bare plan limit with no bonus", () => {
    expect(genesisCeiling(3, 0)).toBe(3);
  });

  it("adds the remaining bonus to the plan limit", () => {
    expect(genesisCeiling(3, 15)).toBe(18);
    expect(genesisCeiling(5, 15)).toBe(20);
  });

  it("ignores a negative bonus rather than lowering the plan limit", () => {
    expect(genesisCeiling(3, -5)).toBe(3);
  });
});

describe("genesisSpendTarget", () => {
  it("spends the plan allowance while it lasts, even with a bonus available", () => {
    expect(genesisSpendTarget(3, 0, 15)).toBe("plan");
    expect(genesisSpendTarget(3, 2, 15)).toBe("plan");
  });

  it("falls through to the bonus once the plan allowance is used up", () => {
    expect(genesisSpendTarget(3, 3, 15)).toBe("bonus");
  });

  it("stays on plan when the allowance is gone and no bonus is left", () => {
    // checkGenesisAccess denies here; the write must not go negative.
    expect(genesisSpendTarget(3, 3, 0)).toBe("plan");
  });

  it("never touches the bonus on unlimited plans", () => {
    expect(genesisSpendTarget(null, 999, 15)).toBe("plan");
  });
});

describe("a redeemed bonus is one-time, not a monthly uplift", () => {
  it("drains the pool across months instead of refilling it", () => {
    const PLAN = 3;
    let bonus = 15;
    let usedThisMonth = 0;

    const spendOne = () => {
      // Mirrors checkGenesisAccess: deny once the month's uses meet the ceiling.
      if (usedThisMonth >= genesisCeiling(PLAN, bonus)) return false;
      if (genesisSpendTarget(PLAN, usedThisMonth, bonus) === "bonus") bonus -= 1;
      else usedThisMonth += 1;
      return true;
    };

    // Month 1: burn the plan allowance, then 5 out of the pool.
    for (let i = 0; i < 8; i++) expect(spendOne()).toBe(true);
    expect(usedThisMonth).toBe(PLAN); // pins at the plan limit
    expect(bonus).toBe(10);

    // Month rolls over: the counter resets but the pool does NOT refill.
    usedThisMonth = 0;
    expect(genesisCeiling(PLAN, bonus)).toBe(13);

    // Month 2: burn the plan allowance and the rest of the pool.
    for (let i = 0; i < 13; i++) expect(spendOne()).toBe(true);
    expect(bonus).toBe(0);

    // Pool exhausted — the ceiling is back to the bare plan limit and the
    // month's allowance is spent, so further uses are denied.
    expect(genesisCeiling(PLAN, bonus)).toBe(PLAN);
    expect(spendOne()).toBe(false);

    // Month 3: only the plan allowance returns. The bonus is gone for good.
    usedThisMonth = 0;
    expect(genesisCeiling(PLAN, bonus)).toBe(PLAN);
    for (let i = 0; i < PLAN; i++) expect(spendOne()).toBe(true);
    expect(spendOne()).toBe(false);
  });
});
