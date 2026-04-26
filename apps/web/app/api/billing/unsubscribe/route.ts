import { NextResponse } from "next/server";
import { apiError, getAuthUser } from "@/lib/api";
import { getStripeClient } from "@/lib/stripe";

const CANCELABLE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

// POST /api/billing/unsubscribe — cancel active subscriptions for the authenticated user.
export async function POST() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!user.email) return apiError("Account email is required.", 400);

  let stripe: ReturnType<typeof import("@/lib/stripe")["getStripeClient"]>;
  try {
    stripe = getStripeClient();
  } catch {
    return apiError("Billing is not configured.", 500);
  }

  let cancelled = 0;

  try {
    const { data: customers } = await stripe.customers.list({
      email: user.email,
      limit: 10,
    });

    for (const customer of customers) {
      if (customer.deleted) continue;
      const { data: subscriptions } = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 20,
      });

      for (const sub of subscriptions) {
        if (!CANCELABLE_STATUSES.has(sub.status)) continue;
        await stripe.subscriptions.cancel(sub.id);
        cancelled += 1;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to unsubscribe.";
    return apiError(message, 500);
  }

  return NextResponse.json({
    unsubscribed: cancelled,
    message:
      cancelled > 0
        ? `Cancelled ${cancelled} subscription${cancelled === 1 ? "" : "s"}.`
        : "No active subscriptions were found.",
  });
}
