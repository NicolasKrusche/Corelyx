import type Stripe from "stripe";

/**
 * Readers for Stripe webhook payload fields that moved between API versions.
 *
 * A webhook payload follows the API version pinned on the endpoint in the
 * Stripe dashboard, NOT the version the installed SDK was built against. Both
 * the pre- and post-`2025-03-31.basil` shapes are therefore reachable in
 * production at the same time, while the SDK's types only describe the newer
 * one. Each reader below tries the current location first and falls back to the
 * legacy field, so the handler works regardless of how the endpoint is pinned.
 *
 * These live outside the route module because a Next.js `route.ts` may only
 * export HTTP handlers and route-segment config — an extra named export there
 * fails the build.
 */

/** An expandable Stripe field is either the id string or the full object. */
export function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") return id || null;
  }
  return null;
}

/** Seconds-since-epoch → ISO string, or null if absent/unparseable. */
export function epochToIso(seconds: unknown): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The subscription that generated an invoice.
 *
 * `basil` moved this off the top level of Invoice to
 * `parent.subscription_details.subscription`. Reading only the old path
 * returned undefined on a modern endpoint, so `invoice.paid` hit its
 * `if (!subscriptionId) break` guard and silently stopped renewing periods —
 * no error, no log, subscriptions just quietly expired.
 */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const current = invoice.parent?.subscription_details?.subscription;
  const legacy = (invoice as unknown as { subscription?: unknown }).subscription;
  return stripeId(current) ?? stripeId(legacy);
}

/**
 * The current billing window for a subscription.
 *
 * `basil` moved `current_period_start`/`_end` off Subscription and onto each
 * subscription item. Reading the old location gave undefined, and
 * `new Date(undefined * 1000).toISOString()` throws RangeError — which the
 * webhook's outer catch turned into a 500, so Stripe retried the delivery for
 * days and the status change never landed.
 */
export function subscriptionPeriod(subscription: Stripe.Subscription): {
  start: string | null;
  end: string | null;
} {
  const item = subscription.items?.data?.[0];
  const legacy = subscription as unknown as {
    current_period_start?: unknown;
    current_period_end?: unknown;
  };
  return {
    start: epochToIso(item?.current_period_start) ?? epochToIso(legacy.current_period_start),
    end: epochToIso(item?.current_period_end) ?? epochToIso(legacy.current_period_end),
  };
}
