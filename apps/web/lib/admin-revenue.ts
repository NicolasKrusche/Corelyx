import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { getTierFromPriceId } from "@/lib/billing";
import { invoiceSubscriptionId } from "@/lib/stripe-payload-shapes";
import { createServiceClient } from "@/lib/api";

/* Real revenue for /admin/finances.
 *
 * Two sources, deliberately kept apart because they mean different things:
 *
 *   1. Subscriptions — read live from STRIPE, not from profiles.tier. The tier
 *      column is set by redemption codes and admin grants as well as by paid
 *      checkouts, so counting tiers would bill comped accounts as revenue. It
 *      also does not record the billing interval, promos (the €3.90 welcome
 *      offer), proration or seat quantity. Stripe knows all of it, so Stripe is
 *      the source of truth.
 *
 *   2. Credit packs — read from our own credit_purchases.price_usd, which is
 *      what Stripe actually charged. Never inferred from credits: the $25 and
 *      $50 packs carry +5% / +10% bonus credits, so credits/1000 overstates the
 *      cash by 5-10% on those.
 *
 * Everything here degrades rather than throws: a founder must still be able to
 * read the cost half of the page when Stripe is unreachable or unconfigured.
 */

/** Lowercase ISO currency code → amount in major units (EUR, USD, …). */
export type CurrencyTotals = Record<string, number>;

export type TierRevenueRow = {
  tier: string;
  subscribers: number;
  /** Normalized monthly run-rate contributed by this tier. */
  mrr: CurrencyTotals;
};

export type SubscriptionRevenue = {
  available: boolean;
  /** Why the numbers are missing, when available is false. */
  reason: string | null;
  /** Cash actually collected from subscription invoices in the window. */
  collected: CurrencyTotals;
  /** Forward-looking monthly run-rate from currently active subscriptions. */
  mrr: CurrencyTotals;
  activeCount: number;
  trialingCount: number;
  pastDueCount: number;
  byTier: TierRevenueRow[];
  /** True when a listing hit its page cap, so the totals are a floor. */
  truncated: boolean;
};

export type StripeFees = {
  available: boolean;
  reason: string | null;
  /** Processing fees Stripe took out of customer payments. */
  processing: CurrencyTotals;
  /** Fees Stripe billed separately (Billing, Radar, Connect, …). */
  platform: CurrencyTotals;
  /** Payments the processing fees were charged on — the fee base. */
  paymentCount: number;
  truncated: boolean;
};

export type CreditSales = {
  purchaseCount: number;
  distinctBuyers: number;
  grossUsd: number;
  refundedUsd: number;
  creditsSold: number;
  degraded: boolean;
};

export type CreditLiability = {
  outstandingCredits: number;
  holderCount: number;
  /** Blended USD actually paid per 1,000 credits, across all completed packs. */
  realizedUsdPer1k: number;
  liabilityUsd: number;
  degraded: boolean;
};

/* Stripe list pagination is bounded so a runaway account can never hang the
   page. Crossing a cap sets `truncated` and the page says so — a silently
   capped total reads as complete when it is not. */
const MAX_PAGES = 10;
const PAGE_SIZE = 100;

/** USD per 1 EUR. Static by design — a live FX call on an admin page is not
 *  worth the failure mode. Override with ADMIN_FX_USD_PER_EUR. */
export function usdPerEur(): number {
  const raw = Number(process.env.ADMIN_FX_USD_PER_EUR);
  return Number.isFinite(raw) && raw > 0 ? raw : 1.08;
}

function addTo(totals: CurrencyTotals, currency: string, amount: number): void {
  if (!amount) return;
  const key = currency.toLowerCase();
  totals[key] = (totals[key] ?? 0) + amount;
}

export function sumTotals(...all: CurrencyTotals[]): CurrencyTotals {
  const out: CurrencyTotals = {};
  for (const totals of all) {
    for (const [currency, amount] of Object.entries(totals)) addTo(out, currency, amount);
  }
  return out;
}

/** Collapse mixed currencies to USD. Returns the currencies it could not
 *  convert so the caller can disclose them instead of quietly folding them in. */
export function totalsToUsd(totals: CurrencyTotals): { usd: number; unconverted: string[] } {
  let usd = 0;
  const unconverted: string[] = [];
  for (const [currency, amount] of Object.entries(totals)) {
    if (currency === "usd") usd += amount;
    else if (currency === "eur") usd += amount * usdPerEur();
    else if (amount !== 0) unconverted.push(currency);
  }
  return { usd, unconverted };
}

/** Stripe amounts are in the currency's minor unit for most currencies, but a
 *  handful (JPY, KRW, …) have no minor unit and are already whole. */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

function toMajorUnits(minor: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? minor : minor / 100;
}

/** Months covered by one billing period, used to normalize any interval to MRR. */
function monthsPerPeriod(recurring: Stripe.Price.Recurring | null | undefined): number | null {
  if (!recurring) return null;
  const count = recurring.interval_count || 1;
  switch (recurring.interval) {
    case "month": return count;
    case "year": return count * 12;
    case "week": return (count * 7) / (365 / 12);
    case "day": return count / (365 / 12);
    default: return null;
  }
}

/** The coupon fields we care about, wherever the API version puts them. */
type CouponLike = {
  duration?: string | null;
  percent_off?: number | null;
  amount_off?: number | null;
  currency?: string | null;
};

/**
 * The coupon behind a discount.
 *
 * SDK v22 (API 2025+) moved this to `discount.source.coupon`; older pinned API
 * versions expose `discount.coupon` at the top level. Both are reachable in
 * production depending on how the key is pinned, so read both — the same
 * pattern as lib/stripe-payload-shapes.ts. Either location may hold a bare id
 * string when the field was not expanded; there is nothing usable in that case.
 */
function couponOf(discount: unknown): CouponLike | null {
  if (!discount || typeof discount !== "object") return null;
  const record = discount as { coupon?: unknown; source?: { coupon?: unknown } | null };
  for (const candidate of [record.source?.coupon, record.coupon]) {
    if (candidate && typeof candidate === "object") return candidate as CouponLike;
  }
  return null;
}

/**
 * Discount multiplier and flat reduction applied to a subscription.
 *
 * Only currently-effective coupons are applied. A `once` coupon is deliberately
 * ignored for MRR: it reduces the next invoice, not the ongoing run-rate, and
 * the collected-cash figure already reflects it exactly.
 */
function discountOf(subscription: Stripe.Subscription): { percentOff: number; amountOff: number; currency: string | null } {
  const record = subscription as unknown as {
    discount?: unknown;
    discounts?: unknown[] | null;
  };
  const discounts: unknown[] = [];
  if (record.discount) discounts.push(record.discount);
  for (const entry of record.discounts ?? []) discounts.push(entry);

  let percentOff = 0;
  let amountOff = 0;
  let currency: string | null = null;
  for (const discount of discounts) {
    const coupon = couponOf(discount);
    if (!coupon || coupon.duration === "once") continue;
    if (typeof coupon.percent_off === "number") percentOff += coupon.percent_off;
    if (typeof coupon.amount_off === "number" && coupon.currency) {
      amountOff += toMajorUnits(coupon.amount_off, coupon.currency);
      currency = coupon.currency.toLowerCase();
    }
  }
  return { percentOff: Math.min(percentOff, 100), amountOff, currency };
}

/** Normalized monthly value of one subscription, per currency. */
function subscriptionMrr(subscription: Stripe.Subscription): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const item of subscription.items?.data ?? []) {
    const price = item.price;
    if (!price || price.unit_amount == null) continue;
    const months = monthsPerPeriod(price.recurring);
    if (!months || months <= 0) continue;
    const gross = toMajorUnits(price.unit_amount * (item.quantity ?? 1), price.currency);
    addTo(totals, price.currency, gross / months);
  }

  const { percentOff, amountOff, currency } = discountOf(subscription);
  if (percentOff > 0) {
    for (const key of Object.keys(totals)) totals[key] *= 1 - percentOff / 100;
  }
  if (amountOff > 0 && currency && totals[currency] != null) {
    totals[currency] = Math.max(0, totals[currency] - amountOff);
  }
  return totals;
}

function tierOf(subscription: Stripe.Subscription): string {
  for (const item of subscription.items?.data ?? []) {
    const tier = item.price?.id ? getTierFromPriceId(item.price.id) : null;
    if (tier) return tier;
  }
  return "unknown";
}

async function listSubscriptionsWith(
  stripe: Stripe,
  status: Stripe.SubscriptionListParams.Status,
  expand: string[],
): Promise<{ data: Stripe.Subscription[]; truncated: boolean }> {
  const data: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res: Stripe.ApiList<Stripe.Subscription> = await stripe.subscriptions.list({
      status,
      limit: PAGE_SIZE,
      starting_after: startingAfter,
      expand,
    });
    data.push(...res.data);
    if (!res.has_more || res.data.length === 0) return { data, truncated: false };
    startingAfter = res.data[res.data.length - 1].id;
  }
  return { data, truncated: true };
}

async function listSubscriptions(
  stripe: Stripe,
  status: Stripe.SubscriptionListParams.Status,
): Promise<{ data: Stripe.Subscription[]; truncated: boolean }> {
  // Expanding the coupon is what makes a discounted subscription report its
  // real run-rate instead of list price. The path is only valid on the newer
  // API shape, so fall back to the flat listing if the key is pinned to an
  // older version — a rejected expand must not cost us the whole figure.
  try {
    return await listSubscriptionsWith(stripe, status, ["data.discounts.source.coupon"]);
  } catch {
    return await listSubscriptionsWith(stripe, status, ["data.discounts"]);
  }
}

/**
 * Subscription cash collected since `since`, plus the current run-rate.
 *
 * Collected reads paid invoices — real money, already net of discounts, credits
 * and proration, with no modelling on our side. Only subscription invoices are
 * counted; one-off credit-pack Checkout sessions are picked up from
 * credit_purchases instead, so nothing is double-counted.
 */
export async function getSubscriptionRevenue(since: Date): Promise<SubscriptionRevenue> {
  const empty: SubscriptionRevenue = {
    available: false,
    reason: null,
    collected: {},
    mrr: {},
    activeCount: 0,
    trialingCount: 0,
    pastDueCount: 0,
    byTier: [],
    truncated: false,
  };

  if (!process.env.STRIPE_SECRET_KEY) {
    return { ...empty, reason: "STRIPE_SECRET_KEY is not configured." };
  }

  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    return { ...empty, reason: error instanceof Error ? error.message : "Stripe client unavailable." };
  }

  try {
    const [active, trialing, pastDue] = await Promise.all([
      listSubscriptions(stripe, "active"),
      listSubscriptions(stripe, "trialing"),
      listSubscriptions(stripe, "past_due"),
    ]);

    // Run-rate counts active + past_due: a past-due subscription is revenue at
    // risk, not revenue already lost — Stripe has not cancelled it yet.
    const running = [...active.data, ...pastDue.data];
    const mrr: CurrencyTotals = {};
    const tierTotals = new Map<string, TierRevenueRow>();
    for (const subscription of running) {
      const value = subscriptionMrr(subscription);
      for (const [currency, amount] of Object.entries(value)) addTo(mrr, currency, amount);

      const tier = tierOf(subscription);
      const row = tierTotals.get(tier) ?? { tier, subscribers: 0, mrr: {} };
      row.subscribers += 1;
      for (const [currency, amount] of Object.entries(value)) addTo(row.mrr, currency, amount);
      tierTotals.set(tier, row);
    }

    // Collected: paid invoices in the window that belong to a subscription.
    const collected: CurrencyTotals = {};
    let invoicesTruncated = false;
    let startingAfter: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res: Stripe.ApiList<Stripe.Invoice> = await stripe.invoices.list({
        status: "paid",
        limit: PAGE_SIZE,
        starting_after: startingAfter,
        created: { gte: Math.floor(since.getTime() / 1000) },
      });
      for (const invoice of res.data) {
        if (!invoiceSubscriptionId(invoice)) continue;
        addTo(collected, invoice.currency, toMajorUnits(invoice.amount_paid ?? 0, invoice.currency));
      }
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
      if (page === MAX_PAGES - 1) invoicesTruncated = true;
    }

    return {
      available: true,
      reason: null,
      collected,
      mrr,
      activeCount: active.data.length,
      trialingCount: trialing.data.length,
      pastDueCount: pastDue.data.length,
      byTier: [...tierTotals.values()].sort(
        (a, b) => totalsToUsd(b.mrr).usd - totalsToUsd(a.mrr).usd,
      ),
      truncated: active.truncated || trialing.truncated || pastDue.truncated || invoicesTruncated,
    };
  } catch (error) {
    return {
      ...empty,
      reason: error instanceof Error ? error.message : "Stripe request failed.",
    };
  }
}

/* Balance-transaction types that carry a processing fee on money coming in.
   Refunds are included so a refunded payment's fee adjustment (when Stripe
   returns one) nets out instead of leaving a fee with no revenue behind it. */
const PAYMENT_TX_TYPES = new Set(["charge", "payment", "refund", "payment_refund"]);

/**
 * What Stripe actually took, in the window.
 *
 * Read from balance transactions rather than modelled as "2.9% + 30c": the real
 * rate varies by card type, currency, and cross-border status, and it changes
 * without us noticing. `fee` on a charge is the exact amount deducted, and
 * `stripe_fee` transactions are the separately-billed products (Billing, Radar).
 *
 * This covers every payment — subscription invoices and credit packs alike —
 * which is why the page can subtract it from combined revenue in one go.
 */
export async function getStripeFees(since: Date): Promise<StripeFees> {
  const empty: StripeFees = {
    available: false,
    reason: null,
    processing: {},
    platform: {},
    paymentCount: 0,
    truncated: false,
  };

  if (!process.env.STRIPE_SECRET_KEY) {
    return { ...empty, reason: "STRIPE_SECRET_KEY is not configured." };
  }

  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    return { ...empty, reason: error instanceof Error ? error.message : "Stripe client unavailable." };
  }

  try {
    const processing: CurrencyTotals = {};
    const platform: CurrencyTotals = {};
    let paymentCount = 0;
    let truncated = false;
    let startingAfter: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res: Stripe.ApiList<Stripe.BalanceTransaction> = await stripe.balanceTransactions.list({
        limit: PAGE_SIZE,
        starting_after: startingAfter,
        created: { gte: Math.floor(since.getTime() / 1000) },
      });

      for (const tx of res.data) {
        if (PAYMENT_TX_TYPES.has(tx.type)) {
          if (tx.fee) addTo(processing, tx.currency, toMajorUnits(tx.fee, tx.currency));
          if (tx.type === "charge" || tx.type === "payment") paymentCount += 1;
        } else if (tx.type === "stripe_fee") {
          // Billed as a debit, so amount is negative; the cost is its magnitude.
          addTo(platform, tx.currency, toMajorUnits(Math.abs(tx.amount), tx.currency));
        }
      }

      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    return { available: true, reason: null, processing, platform, paymentCount, truncated };
  } catch (error) {
    return { ...empty, reason: error instanceof Error ? error.message : "Stripe request failed." };
  }
}

type Db = ReturnType<typeof createServiceClient>;

/** Real cash from credit-pack sales in a window. */
export async function getCreditSales(db: Db, since: string): Promise<CreditSales> {
  const rpc = await (db as any).rpc("admin_credit_sales", { since });
  if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
    const row = rpc.data[0] as Record<string, unknown>;
    return {
      purchaseCount: Number(row.purchase_count ?? 0),
      distinctBuyers: Number(row.distinct_buyers ?? 0),
      grossUsd: Number(row.gross_usd ?? 0),
      refundedUsd: Number(row.refunded_usd ?? 0),
      creditsSold: Number(row.credits_sold ?? 0),
      degraded: false,
    };
  }

  // Migration 20260802140000 not applied — aggregate the rows directly.
  const fallback = await (db as any)
    .from("credit_purchases")
    .select("user_id, price_usd, amount_credits, status")
    .gte("created_at", since);
  if (fallback.error) {
    return { purchaseCount: 0, distinctBuyers: 0, grossUsd: 0, refundedUsd: 0, creditsSold: 0, degraded: true };
  }

  const rows = (fallback.data ?? []) as Array<{
    user_id: string | null;
    price_usd: string | number | null;
    amount_credits: string | number | null;
    status: string | null;
  }>;
  const buyers = new Set<string>();
  let purchaseCount = 0;
  let grossUsd = 0;
  let refundedUsd = 0;
  let creditsSold = 0;
  for (const row of rows) {
    const price = Number(row.price_usd ?? 0);
    if (row.status === "refunded") {
      refundedUsd += price;
      continue;
    }
    if (row.status !== "completed") continue;
    purchaseCount += 1;
    grossUsd += price;
    creditsSold += Number(row.amount_credits ?? 0);
    if (row.user_id) buyers.add(row.user_id);
  }
  return { purchaseCount, distinctBuyers: buyers.size, grossUsd, refundedUsd, creditsSold, degraded: true };
}

/** Purchased credits users hold but have not spent — cash in, service owed. */
export async function getCreditLiability(db: Db): Promise<CreditLiability> {
  const rpc = await (db as any).rpc("admin_credit_liability", {});
  if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
    const row = rpc.data[0] as Record<string, unknown>;
    return {
      outstandingCredits: Number(row.outstanding_credits ?? 0),
      holderCount: Number(row.holder_count ?? 0),
      realizedUsdPer1k: Number(row.realized_usd_per_1k ?? 1),
      liabilityUsd: Number(row.liability_usd ?? 0),
      degraded: false,
    };
  }
  return { outstandingCredits: 0, holderCount: 0, realizedUsdPer1k: 1, liabilityUsd: 0, degraded: true };
}
