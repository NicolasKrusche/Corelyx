import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

/**
 * GET /api/billing/portal — Create a Stripe Customer Portal session
 * and redirect to it.
 */
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return apiError("Missing org_id.", 400);

  const service = createServiceClient() as LooseServiceClient;

  // Verify membership
  const { data: membership } = await service
    .from("org_memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return apiError("Organization not found.", 404);
  if (membership.role !== "owner" && membership.role !== "admin") {
    return apiError("Only owners and admins can access billing.", 403);
  }

  // Get Stripe customer ID
  const { data: sub } = await service
    .from("org_subscriptions")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return apiError("No active Stripe customer found for this organization.", 404);
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return apiError("Stripe is not configured.", 500);
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url:
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/org/billing`,
    });

    return NextResponse.redirect(session.url);
  } catch (err) {
    console.error("Stripe portal error:", err);
    return apiError("Failed to create portal session.", 500);
  }
}
