import { NextResponse } from "next/server";
import { apiError, getAuthUser } from "@/lib/api";
import { getStripeClient } from "@/lib/stripe";

// GET /api/billing/portal — create a Stripe Customer Portal session and redirect.
// The portal lets users manage, upgrade, downgrade, or cancel their subscription.
// Redirects to /plan if the user has no Stripe customer record (free tier).
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!user.email) return apiError("Account email is required.", 400);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

  let stripe: ReturnType<typeof import("@/lib/stripe")["getStripeClient"]>;
  try {
    stripe = getStripeClient();
  } catch {
    return apiError("Billing is not configured.", 500);
  }

  const { data: customers } = await stripe.customers.list({
    email: user.email,
    limit: 10,
  });

  if (!customers.length) {
    return NextResponse.redirect(`${base}/plan`, { status: 303 });
  }

  // Prefer a customer that has an active subscription; fall back to the first one.
  const customerWithSub = customers.find((c) => !c.deleted);
  const customer = customerWithSub ?? customers[0];

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${base}/plan?portal=done`,
    });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not open billing portal.";
    // Likely cause: portal not configured in Stripe Dashboard
    return apiError(message, 500);
  }
}
