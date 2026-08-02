import { describe, expect, it, vi } from "vitest";
import {
  billedUsd,
  getFundingSplit,
  tierAllowances,
  unrecoveredCostUsd,
  type FundingBucket,
  type FundingSplitRow,
} from "../admin-finance";
import { ENTITLEMENTS } from "../entitlements";

vi.mock("../api", () => ({ createServiceClient: () => ({}) }));

/* The funding split is what makes "credits consumed" legible as money. Every
   bucket below has a different cash meaning, and the old page collapsed all of
   them into a single "Revenue" figure. */

type Row = {
  user_id: string | null;
  model: string | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  billing?: string | null;
  billed_credits?: number | null;
  created_at: string;
};

function usageRow(overrides: Partial<Row> = {}): Row {
  return {
    user_id: "u1",
    model: "openai/gpt-oss-120b",
    total_tokens: 1_000,
    estimated_cost_usd: 0.01,
    billing: "platform",
    billed_credits: 100,
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

/** A service client whose finance RPC is missing, forcing the JS fallback. */
function fallbackDb(usage: Row[], profiles: Array<{ id: string; tier: string | null; is_admin: boolean | null }>) {
  return {
    rpc: vi.fn().mockResolvedValue({ error: { message: "function does not exist" }, data: null }),
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ in: () => Promise.resolve({ data: profiles, error: null }) }) };
      }
      return {
        select: () => ({ gte: () => ({ limit: () => Promise.resolve({ data: usage, error: null }) }) }),
      };
    },
  };
}

function bucket(rows: FundingSplitRow[], name: FundingBucket): FundingSplitRow {
  const row = rows.find((r) => r.bucket === name);
  if (!row) throw new Error(`missing bucket ${name}`);
  return row;
}

describe("tierAllowances", () => {
  it("mirrors ENTITLEMENTS so the SQL side cannot drift from the app", () => {
    const allowances = tierAllowances();
    expect(allowances.free).toBe(ENTITLEMENTS.free.includedAiCredits);
    expect(allowances.plus).toBe(ENTITLEMENTS.plus.includedAiCredits);
    expect(allowances.builder).toBe(ENTITLEMENTS.builder.includedAiCredits);
    // Unlimited has no allowance; those users are classified as comped instead.
    expect(allowances.unlimited).toBe(0);
  });
});

describe("getFundingSplit", () => {
  it("attributes admin and unlimited usage to comped, never to revenue", async () => {
    // deductUserCredits returns true without charging these accounts, but the
    // runtime logs billed_credits anyway — which is exactly how founder testing
    // used to show up as revenue.
    const { data } = await getFundingSplit(
      fallbackDb(
        [
          usageRow({ user_id: "admin", billed_credits: 5_000, estimated_cost_usd: 0.5 }),
          usageRow({ user_id: "unl", billed_credits: 3_000, estimated_cost_usd: 0.3 }),
        ],
        [
          { id: "admin", tier: "free", is_admin: true },
          { id: "unl", tier: "unlimited", is_admin: false },
        ],
      ) as never,
      "2026-08-01T00:00:00.000Z",
    );

    expect(bucket(data, "comped").billedCredits).toBe(8_000);
    expect(bucket(data, "comped").platformCostUsd).toBeCloseTo(0.8, 6);
    expect(bucket(data, "comped").userCount).toBe(2);
    expect(bucket(data, "purchased").billedCredits).toBe(0);
    expect(bucket(data, "plan_included").billedCredits).toBe(0);
  });

  it("splits a paid user at their plan allowance: included first, then top-up", async () => {
    // Solo includes 2,500. Consuming 4,000 means 2,500 came from the plan and
    // 1,500 from a balance the user paid cash for.
    const { data } = await getFundingSplit(
      fallbackDb(
        [usageRow({ user_id: "solo", billed_credits: 4_000, estimated_cost_usd: 0.4 })],
        [{ id: "solo", tier: "plus", is_admin: false }],
      ) as never,
      "2026-08-01T00:00:00.000Z",
    );

    expect(bucket(data, "plan_included").billedCredits).toBe(2_500);
    expect(bucket(data, "purchased").billedCredits).toBe(1_500);
    // Cost follows credits proportionally.
    expect(bucket(data, "plan_included").platformCostUsd).toBeCloseTo(0.25, 6);
    expect(bucket(data, "purchased").platformCostUsd).toBeCloseTo(0.15, 6);
  });

  it("keeps free-tier consumption in its own bucket, separate from paid plans", async () => {
    const { data } = await getFundingSplit(
      fallbackDb(
        [
          usageRow({ user_id: "freebie", billed_credits: 400, estimated_cost_usd: 0.04 }),
          usageRow({ user_id: "solo", billed_credits: 1_000, estimated_cost_usd: 0.1 }),
        ],
        [
          { id: "freebie", tier: "free", is_admin: false },
          { id: "solo", tier: "plus", is_admin: false },
        ],
      ) as never,
      "2026-08-01T00:00:00.000Z",
    );

    expect(bucket(data, "free_included").billedCredits).toBe(400);
    expect(bucket(data, "plan_included").billedCredits).toBe(1_000);
    expect(bucket(data, "purchased").billedCredits).toBe(0);
  });

  it("treats zero-credit platform rows as unbilled cost, not as free usage", async () => {
    // Genesis is metered by the genesis_uses quota and logs billed_credits = 0.
    // The provider cost is still ours.
    const { data } = await getFundingSplit(
      fallbackDb(
        [usageRow({ user_id: "solo", billed_credits: 0, estimated_cost_usd: 0.12 })],
        [{ id: "solo", tier: "plus", is_admin: false }],
      ) as never,
      "2026-08-01T00:00:00.000Z",
    );

    expect(bucket(data, "unbilled").platformCostUsd).toBeCloseTo(0.12, 6);
    expect(bucket(data, "unbilled").userCount).toBe(1);
    expect(bucket(data, "free_included").platformCostUsd).toBe(0);
  });

  it("excludes BYOK entirely — the user's own key paid the provider", async () => {
    const { data } = await getFundingSplit(
      fallbackDb(
        [usageRow({ user_id: "solo", billing: "byok", billed_credits: 0, estimated_cost_usd: 9.99 })],
        [{ id: "solo", tier: "plus", is_admin: false }],
      ) as never,
      "2026-08-01T00:00:00.000Z",
    );

    for (const row of data) expect(row.platformCostUsd).toBe(0);
  });

  it("reads the aggregation when it exists and reports it as non-degraded", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        error: null,
        data: [
          { bucket: "purchased", billed_credits: 1_500, platform_cost_usd: 0.15, user_count: 1 },
          { bucket: "comped", billed_credits: 8_000, platform_cost_usd: 0.8, user_count: 2 },
        ],
      }),
    };
    const result = await getFundingSplit(db as never, "2026-08-01T00:00:00.000Z");
    expect(result.degraded).toBe(false);
    expect(bucket(result.data, "purchased").billedCredits).toBe(1_500);
    // Buckets the aggregation did not return still appear, zeroed.
    expect(bucket(result.data, "free_included").billedCredits).toBe(0);
    expect(db.rpc).toHaveBeenCalledWith(
      "admin_llm_funding_split",
      expect.objectContaining({ tier_allowances: expect.objectContaining({ plus: 2_500 }) }),
    );
  });
});

describe("unrecoveredCostUsd", () => {
  it("counts free-tier, comped and unbilled cost but not plan-included", async () => {
    // Plan-included consumption was paid for by the subscription. The other
    // three produced no cash inflow at all — that is the number worth watching.
    const { data } = await getFundingSplit(
      fallbackDb(
        [
          usageRow({ user_id: "freebie", billed_credits: 400, estimated_cost_usd: 0.04 }),
          usageRow({ user_id: "admin", billed_credits: 1_000, estimated_cost_usd: 0.1 }),
          usageRow({ user_id: "solo", billed_credits: 0, estimated_cost_usd: 0.02 }),
          usageRow({ user_id: "solo", billed_credits: 1_000, estimated_cost_usd: 0.1 }),
        ],
        [
          { id: "freebie", tier: "free", is_admin: false },
          { id: "admin", tier: "free", is_admin: true },
          { id: "solo", tier: "plus", is_admin: false },
        ],
      ) as never,
      "2026-08-01T00:00:00.000Z",
    );

    expect(unrecoveredCostUsd(data)).toBeCloseTo(0.16, 6); // 0.04 + 0.10 + 0.02
  });
});

describe("billedUsd", () => {
  it("is a nominal valuation, not revenue", () => {
    // Kept for display of what was deducted from balances. The name of the card
    // that used to show this as "Revenue" is the bug this whole change fixes.
    expect(billedUsd(2_500)).toBe(2.5);
  });
});
