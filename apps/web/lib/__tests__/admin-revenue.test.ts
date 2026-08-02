import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* The finances page used to call SUM(billed_credits)/1000 "revenue". These
   tests pin the properties that made that wrong and the ones the replacement
   depends on: real cash comes from Stripe and credit_purchases, credits are
   only a consumption measure, and any billing interval normalizes to a monthly
   run-rate. */

const listSubscriptions = vi.fn();
const listInvoices = vi.fn();
const listBalanceTransactions = vi.fn();

vi.mock("../stripe", () => ({
  getStripeClient: () => ({
    subscriptions: { list: listSubscriptions },
    invoices: { list: listInvoices },
    balanceTransactions: { list: listBalanceTransactions },
  }),
}));

vi.mock("../api", () => ({ createServiceClient: () => ({}) }));

const ORIGINAL_ENV = { ...process.env };

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    items: { data: [{ quantity: 1, price: { id: "price_plus_monthly", currency: "eur", unit_amount: 990, recurring: { interval: "month", interval_count: 1 } } }] },
    ...overrides,
  };
}

function page(data: unknown[], hasMore = false) {
  return { data, has_more: hasMore };
}

beforeEach(() => {
  vi.resetModules();
  listSubscriptions.mockReset();
  listInvoices.mockReset();
  listBalanceTransactions.mockReset();
  listBalanceTransactions.mockResolvedValue(page([]));
  process.env = { ...ORIGINAL_ENV, STRIPE_SECRET_KEY: "sk_test", ADMIN_FX_USD_PER_EUR: "1.10" };
  process.env.STRIPE_PRICE_PLUS_MONTHLY = "price_plus_monthly";
  process.env.STRIPE_PRICE_PRO_YEARLY = "price_pro_yearly";
  listInvoices.mockResolvedValue(page([]));
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("currency handling", () => {
  it("converts EUR at the configured rate and keeps USD as-is", async () => {
    const { totalsToUsd } = await import("../admin-revenue");
    const { usd, unconverted } = totalsToUsd({ eur: 100, usd: 50 });
    expect(usd).toBeCloseTo(160, 6); // 100 * 1.10 + 50
    expect(unconverted).toEqual([]);
  });

  it("excludes currencies it cannot convert rather than silently treating them as USD", async () => {
    const { totalsToUsd } = await import("../admin-revenue");
    const { usd, unconverted } = totalsToUsd({ usd: 10, gbp: 200 });
    expect(usd).toBe(10);
    expect(unconverted).toEqual(["gbp"]);
  });

  it("sums per-currency without cross-contaminating", async () => {
    const { sumTotals } = await import("../admin-revenue");
    const totals = sumTotals({ eur: 9.9 }, { eur: 19.9, usd: 5 });
    expect(Object.keys(totals).sort()).toEqual(["eur", "usd"]);
    expect(totals.eur).toBeCloseTo(29.8, 6);
    expect(totals.usd).toBe(5);
  });

  it("falls back to a sane FX rate when the override is missing or junk", async () => {
    process.env.ADMIN_FX_USD_PER_EUR = "not-a-number";
    const { usdPerEur } = await import("../admin-revenue");
    expect(usdPerEur()).toBe(1.08);
  });
});

describe("getSubscriptionRevenue", () => {
  it("degrades instead of throwing when Stripe is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { getSubscriptionRevenue } = await import("../admin-revenue");
    const result = await getSubscriptionRevenue(new Date("2026-08-01"));
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/STRIPE_SECRET_KEY/);
    expect(result.mrr).toEqual({});
  });

  it("degrades instead of throwing when Stripe errors", async () => {
    listSubscriptions.mockRejectedValue(new Error("connection reset"));
    const { getSubscriptionRevenue } = await import("../admin-revenue");
    const result = await getSubscriptionRevenue(new Date("2026-08-01"));
    expect(result.available).toBe(false);
    expect(result.reason).toBe("connection reset");
  });

  it("normalizes a yearly subscription to a monthly run-rate", async () => {
    listSubscriptions.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve(
        status === "active"
          ? page([
              subscription({
                items: {
                  data: [{
                    quantity: 1,
                    price: { id: "price_pro_yearly", currency: "eur", unit_amount: 19_100, recurring: { interval: "year", interval_count: 1 } },
                  }],
                },
              }),
            ])
          : page([]),
      ),
    );

    const { getSubscriptionRevenue } = await import("../admin-revenue");
    const result = await getSubscriptionRevenue(new Date("2026-08-01"));
    expect(result.available).toBe(true);
    expect(result.mrr.eur).toBeCloseTo(191 / 12, 6);
    expect(result.byTier).toEqual([
      expect.objectContaining({ tier: "pro", subscribers: 1 }),
    ]);
  });

  it("multiplies by seat quantity", async () => {
    listSubscriptions.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve(status === "active" ? page([subscription({ items: { data: [{ quantity: 3, price: { id: "price_plus_monthly", currency: "eur", unit_amount: 990, recurring: { interval: "month", interval_count: 1 } } }] } })]) : page([])),
    );
    const { getSubscriptionRevenue } = await import("../admin-revenue");
    const result = await getSubscriptionRevenue(new Date("2026-08-01"));
    expect(result.mrr.eur).toBeCloseTo(29.7, 6);
  });

  it("applies a recurring percent-off coupon but ignores a one-off one", async () => {
    // The €3.90-instead-of-€9.90 welcome offer is a coupon. A `forever`/
    // `repeating` coupon really does lower the run-rate; a `once` coupon only
    // touches the next invoice, which the collected figure already captures.
    const withCoupon = (duration: string) =>
      subscription({ discounts: [{ source: { coupon: { duration, percent_off: 60 } } }] });

    listSubscriptions.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve(status === "active" ? page([withCoupon("forever")]) : page([])),
    );
    const { getSubscriptionRevenue } = await import("../admin-revenue");
    expect((await getSubscriptionRevenue(new Date("2026-08-01"))).mrr.eur).toBeCloseTo(3.96, 6);

    vi.resetModules();
    listSubscriptions.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve(status === "active" ? page([withCoupon("once")]) : page([])),
    );
    const again = await import("../admin-revenue");
    expect((await again.getSubscriptionRevenue(new Date("2026-08-01"))).mrr.eur).toBeCloseTo(9.9, 6);
  });

  it("reads a coupon from the legacy top-level shape too", async () => {
    listSubscriptions.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve(
        status === "active"
          ? page([subscription({ discount: { coupon: { duration: "forever", percent_off: 50 } } })])
          : page([]),
      ),
    );
    const { getSubscriptionRevenue } = await import("../admin-revenue");
    expect((await getSubscriptionRevenue(new Date("2026-08-01"))).mrr.eur).toBeCloseTo(4.95, 6);
  });

  it("counts past-due subscriptions in the run-rate but trialing ones only as a count", async () => {
    listSubscriptions.mockImplementation(({ status }: { status: string }) => {
      if (status === "active") return Promise.resolve(page([subscription({ id: "sub_a" })]));
      if (status === "past_due") return Promise.resolve(page([subscription({ id: "sub_b" })]));
      return Promise.resolve(page([subscription({ id: "sub_c" })])); // trialing
    });

    const { getSubscriptionRevenue } = await import("../admin-revenue");
    const result = await getSubscriptionRevenue(new Date("2026-08-01"));
    expect(result.activeCount).toBe(1);
    expect(result.pastDueCount).toBe(1);
    expect(result.trialingCount).toBe(1);
    expect(result.mrr.eur).toBeCloseTo(19.8, 6); // active + past_due, not trialing
  });

  it("counts only subscription invoices as collected, so credit packs are not double-counted", async () => {
    listSubscriptions.mockResolvedValue(page([]));
    listInvoices.mockResolvedValue(
      page([
        { currency: "eur", amount_paid: 990, parent: { subscription_details: { subscription: "sub_1" } } },
        { currency: "usd", amount_paid: 5_000, parent: null }, // a credit pack — must be ignored here
      ]),
    );

    const { getSubscriptionRevenue } = await import("../admin-revenue");
    const result = await getSubscriptionRevenue(new Date("2026-08-01"));
    expect(result.collected).toEqual({ eur: 9.9 });
  });

  it("falls back to the flat listing when the nested coupon expand is rejected", async () => {
    let sawNestedExpand = false;
    listSubscriptions.mockImplementation(({ expand }: { expand: string[] }) => {
      if (expand?.includes("data.discounts.source.coupon")) {
        sawNestedExpand = true;
        return Promise.reject(new Error("Invalid expand value"));
      }
      return Promise.resolve(page([]));
    });

    const { getSubscriptionRevenue } = await import("../admin-revenue");
    const result = await getSubscriptionRevenue(new Date("2026-08-01"));
    expect(sawNestedExpand).toBe(true);
    expect(result.available).toBe(true);
  });

  it("flags truncation instead of quietly reporting a partial total", async () => {
    listSubscriptions.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve(status === "active" ? page([subscription()], true) : page([])),
    );
    const { getSubscriptionRevenue } = await import("../admin-revenue");
    expect((await getSubscriptionRevenue(new Date("2026-08-01"))).truncated).toBe(true);
  });
});

describe("getStripeFees", () => {
  it("sums the fees Stripe actually took, not a modelled percentage", async () => {
    // 2.9% + 30c on €9.90 would be 59c. Stripe charged 62c here — cross-border,
    // a different card type, whatever. The real number is the one that matters.
    listBalanceTransactions.mockResolvedValue(
      page([
        { id: "txn_1", type: "charge", currency: "eur", amount: 990, fee: 62 },
        { id: "txn_2", type: "payment", currency: "usd", amount: 2_500, fee: 103 },
      ]),
    );

    const { getStripeFees } = await import("../admin-revenue");
    const result = await getStripeFees(new Date("2026-08-01"));
    expect(result.available).toBe(true);
    expect(result.processing).toEqual({ eur: 0.62, usd: 1.03 });
    expect(result.paymentCount).toBe(2);
  });

  it("counts separately-billed Stripe products from their debit amount", async () => {
    listBalanceTransactions.mockResolvedValue(
      page([
        { id: "txn_1", type: "charge", currency: "eur", amount: 990, fee: 59 },
        // Billing/Radar arrive as their own negative-amount transaction with no `fee`.
        { id: "txn_2", type: "stripe_fee", currency: "eur", amount: -45, fee: 0 },
      ]),
    );

    const { getStripeFees } = await import("../admin-revenue");
    const result = await getStripeFees(new Date("2026-08-01"));
    expect(result.processing).toEqual({ eur: 0.59 });
    expect(result.platform).toEqual({ eur: 0.45 });
    // A platform fee is not a payment, so it must not inflate the fee base.
    expect(result.paymentCount).toBe(1);
  });

  it("ignores payouts and transfers, which move money without costing a fee", async () => {
    listBalanceTransactions.mockResolvedValue(
      page([
        { id: "txn_1", type: "payout", currency: "eur", amount: -10_000, fee: 0 },
        { id: "txn_2", type: "transfer", currency: "eur", amount: -500, fee: 25 },
      ]),
    );

    const { getStripeFees } = await import("../admin-revenue");
    const result = await getStripeFees(new Date("2026-08-01"));
    expect(result.processing).toEqual({});
    expect(result.platform).toEqual({});
    expect(result.paymentCount).toBe(0);
  });

  it("nets a refund's fee adjustment against the original charge", async () => {
    listBalanceTransactions.mockResolvedValue(
      page([
        { id: "txn_1", type: "charge", currency: "eur", amount: 990, fee: 59 },
        { id: "txn_2", type: "refund", currency: "eur", amount: -990, fee: -59 },
      ]),
    );

    const { getStripeFees } = await import("../admin-revenue");
    const result = await getStripeFees(new Date("2026-08-01"));
    expect(result.processing.eur).toBeCloseTo(0, 6);
    // The refund is not a new payment.
    expect(result.paymentCount).toBe(1);
  });

  it("degrades rather than throwing, and says the fees are missing", async () => {
    listBalanceTransactions.mockRejectedValue(new Error("permission denied"));
    const { getStripeFees } = await import("../admin-revenue");
    const result = await getStripeFees(new Date("2026-08-01"));
    expect(result.available).toBe(false);
    expect(result.reason).toBe("permission denied");
    expect(result.processing).toEqual({});
  });

  it("flags truncation so an understated fee total is not read as complete", async () => {
    listBalanceTransactions.mockResolvedValue(
      page([{ id: "txn_1", type: "charge", currency: "eur", amount: 990, fee: 59 }], true),
    );
    const { getStripeFees } = await import("../admin-revenue");
    expect((await getStripeFees(new Date("2026-08-01"))).truncated).toBe(true);
  });

  it("treats zero-decimal currencies as whole units", async () => {
    listBalanceTransactions.mockResolvedValue(
      page([{ id: "txn_1", type: "charge", currency: "jpy", amount: 1_500, fee: 60 }]),
    );
    const { getStripeFees } = await import("../admin-revenue");
    expect((await getStripeFees(new Date("2026-08-01"))).processing).toEqual({ jpy: 60 });
  });
});

describe("getCreditSales", () => {
  function db(rpcResult: unknown, rows?: unknown[]) {
    return {
      rpc: vi.fn().mockResolvedValue(rpcResult),
      from: () => ({ select: () => ({ gte: () => Promise.resolve({ data: rows ?? [], error: null }) }) }),
    };
  }

  it("reads real cash from the aggregation when the migration is applied", async () => {
    const { getCreditSales } = await import("../admin-revenue");
    const result = await getCreditSales(
      db({ error: null, data: [{ purchase_count: 3, distinct_buyers: 2, gross_usd: 80, refunded_usd: 5, credits_sold: 81_250 }] }) as never,
      "2026-08-01T00:00:00.000Z",
    );
    // 81,250 credits for $80 — valuing them at the nominal 1000/USD would have
    // claimed $81.25. The cash figure has to come from price_usd.
    expect(result.grossUsd).toBe(80);
    expect(result.creditsSold).toBe(81_250);
    expect(result.degraded).toBe(false);
  });

  it("falls back to a raw scan and excludes non-completed purchases", async () => {
    const { getCreditSales } = await import("../admin-revenue");
    const result = await getCreditSales(
      db({ error: { message: "missing function" }, data: null }, [
        { user_id: "u1", price_usd: 25, amount_credits: 26_250, status: "completed" },
        { user_id: "u1", price_usd: 10, amount_credits: 10_000, status: "completed" },
        { user_id: "u2", price_usd: 5, amount_credits: 5_000, status: "pending" },
        { user_id: "u3", price_usd: 50, amount_credits: 55_000, status: "refunded" },
      ]) as never,
      "2026-08-01T00:00:00.000Z",
    );
    expect(result.grossUsd).toBe(35);
    expect(result.refundedUsd).toBe(50);
    expect(result.purchaseCount).toBe(2);
    expect(result.distinctBuyers).toBe(1);
    expect(result.degraded).toBe(true);
  });
});
