import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  epochToIso,
  invoiceSubscriptionId,
  stripeId,
  subscriptionPeriod,
} from "../stripe-payload-shapes";

// A webhook payload follows the API version pinned on the Stripe endpoint, not
// the SDK's. These tests pin both shapes so a future SDK bump cannot silently
// reintroduce the two bugs these readers exist to fix:
//   - invoice.paid stopped renewing periods (silent, no error)
//   - customer.subscription.updated threw RangeError -> 500 -> endless retries
//
// The payloads are deliberately partial; each is cast at the call site because
// the SDK types only describe the post-basil shape.
const asInvoice = (v: unknown) => v as Stripe.Invoice;
const asSubscription = (v: unknown) => v as Stripe.Subscription;

describe("stripeId", () => {
  it("returns a bare id string", () => {
    expect(stripeId("sub_123")).toBe("sub_123");
  });

  it("unwraps an expanded object", () => {
    expect(stripeId({ id: "sub_123", object: "subscription" })).toBe("sub_123");
  });

  it("returns null for absent, empty, or non-id values", () => {
    expect(stripeId(undefined)).toBeNull();
    expect(stripeId(null)).toBeNull();
    expect(stripeId("")).toBeNull();
    expect(stripeId({})).toBeNull();
    expect(stripeId({ id: 42 })).toBeNull();
    expect(stripeId(42)).toBeNull();
  });
});

describe("epochToIso", () => {
  it("converts seconds since epoch", () => {
    expect(epochToIso(1_700_000_000)).toBe("2023-11-14T22:13:20.000Z");
  });

  it("returns null instead of throwing on unusable input", () => {
    // This is the specific guard: new Date(undefined * 1000).toISOString()
    // throws RangeError, which became a 500 and made Stripe retry for days.
    expect(epochToIso(undefined)).toBeNull();
    expect(epochToIso(null)).toBeNull();
    expect(epochToIso(NaN)).toBeNull();
    expect(epochToIso(Infinity)).toBeNull();
    expect(epochToIso("1700000000")).toBeNull();
  });
});

describe("invoiceSubscriptionId", () => {
  it("reads the post-basil parent.subscription_details path", () => {
    const invoice = asInvoice({
      id: "in_1",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_new" } },
    });
    expect(invoiceSubscriptionId(invoice)).toBe("sub_new");
  });

  it("unwraps an expanded subscription object under parent", () => {
    const invoice = asInvoice({
      id: "in_1",
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: { id: "sub_expanded" } },
      },
    });
    expect(invoiceSubscriptionId(invoice)).toBe("sub_expanded");
  });

  it("falls back to the legacy top-level field on an older endpoint", () => {
    // The regression: this shape returned undefined and renewals silently
    // stopped extending the billing period.
    const invoice = asInvoice({ id: "in_1", subscription: "sub_legacy" });
    expect(invoiceSubscriptionId(invoice)).toBe("sub_legacy");
  });

  it("prefers the current path when both are present", () => {
    const invoice = asInvoice({
      id: "in_1",
      subscription: "sub_legacy",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_new" } },
    });
    expect(invoiceSubscriptionId(invoice)).toBe("sub_new");
  });

  it("returns null for a genuine one-off invoice", () => {
    expect(invoiceSubscriptionId(asInvoice({ id: "in_1", parent: null }))).toBeNull();
    expect(
      invoiceSubscriptionId(
        asInvoice({ id: "in_1", parent: { type: "quote_details", subscription_details: null } })
      )
    ).toBeNull();
  });
});

describe("subscriptionPeriod", () => {
  it("reads the post-basil per-item window", () => {
    const subscription = asSubscription({
      id: "sub_1",
      items: { data: [{ current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 }] },
    });
    expect(subscriptionPeriod(subscription)).toEqual({
      start: "2023-11-14T22:13:20.000Z",
      end: "2023-12-14T22:13:20.000Z",
    });
  });

  it("falls back to the legacy top-level window", () => {
    const subscription = asSubscription({
      id: "sub_1",
      items: { data: [] },
      current_period_start: 1_700_000_000,
      current_period_end: 1_702_592_000,
    });
    expect(subscriptionPeriod(subscription)).toEqual({
      start: "2023-11-14T22:13:20.000Z",
      end: "2023-12-14T22:13:20.000Z",
    });
  });

  it("returns nulls rather than throwing when neither shape is present", () => {
    // Previously this path threw RangeError out of the handler.
    expect(() => subscriptionPeriod(asSubscription({ id: "sub_1" }))).not.toThrow();
    expect(subscriptionPeriod(asSubscription({ id: "sub_1" }))).toEqual({
      start: null,
      end: null,
    });
  });

  it("resolves each bound independently when only one is readable", () => {
    const subscription = asSubscription({
      id: "sub_1",
      items: { data: [{ current_period_end: 1_702_592_000 }] },
    });
    expect(subscriptionPeriod(subscription)).toEqual({
      start: null,
      end: "2023-12-14T22:13:20.000Z",
    });
  });
});
