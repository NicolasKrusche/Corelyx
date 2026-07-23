import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type SubscriptionRow = {
  id: string;
  org_id: string;
  plan_id: string;
  billing_mode: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: string;
  current_period_start: string;
  current_period_end: string;
  seats_count: number;
  created_at: string;
  updated_at: string;
};

type PlanRow = {
  id: string;
  name: string;
  slug: string;
  seat_price_monthly: number;
  included_seats: number;
  execution_price_per_minute: number;
  included_execution_minutes: number;
  byok_platform_fee_monthly: number;
  features: string[];
};

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  subscription_id: string | null;
};

async function getOrgForUser(
  service: LooseServiceClient,
  userId: string
): Promise<OrgRow | null> {
  const { data: memberships } = await service
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!memberships) return null;

  const { data: org } = await service
    .from("organizations")
    .select("id, name, slug, subscription_id")
    .eq("id", memberships.org_id)
    .maybeSingle();

  return (org ?? null) as OrgRow | null;
}

const CreateSubscriptionSchema = z.object({
  org_id: z.string().uuid(),
  plan_slug: z.string().min(1),
  billing_mode: z.enum(["managed", "byok"]).default("managed"),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

/**
 * GET /api/billing/subscription — Get current subscription for the user's org.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const org = await getOrgForUser(service, user.id);
  if (!org) return apiError("Organization not found.", 404);

  // Get or create subscription
  let { data: subscription } = await service
    .from("org_subscriptions")
    .select("*")
    .eq("org_id", org.id)
    .eq("status", "active")
    .maybeSingle();

  // Auto-create free subscription if none exists
  if (!subscription) {
    const { data: freePlan } = await service
      .from("billing_plans")
      .select("id")
      .eq("slug", "free")
      .eq("is_active", true)
      .maybeSingle();

    if (freePlan) {
      const { data: newSub } = await service
        .from("org_subscriptions")
        .insert({
          org_id: org.id,
          plan_id: freePlan.id,
          billing_mode: "managed",
          status: "active",
          seats_count: 1,
        } as never)
        .select("*")
        .maybeSingle();

      if (newSub) {
        subscription = newSub;
        // Link to org
        await service
          .from("organizations")
          .update({ subscription_id: newSub.id } as never)
          .eq("id", org.id);
      }
    }
  }

  if (!subscription) {
    return apiError("No active subscription found.", 404);
  }

  // Hydrate plan details
  const sub = subscription as SubscriptionRow;
  const { data: plan } = await service
    .from("billing_plans")
    .select("*")
    .eq("id", sub.plan_id)
    .maybeSingle();

  return NextResponse.json({
    subscription: sub,
    plan: (plan ?? null) as PlanRow | null,
    org: { id: org.id, name: org.name, slug: org.slug },
  });
}

/**
 * POST /api/billing/subscription — Create or update a subscription.
 *
 * For Stripe integration: creates a Checkout Session URL.
 * For plan changes: updates the subscription directly.
 */
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const parsed = CreateSubscriptionSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;

  // Verify org membership
  const { data: membership } = await service
    .from("org_memberships")
    .select("role")
    .eq("org_id", parsed.data.org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return apiError("Organization not found.", 404);
  if (membership.role !== "owner" && membership.role !== "admin") {
    return apiError("Only owners and admins can manage subscriptions.", 403);
  }

  // Look up the target plan
  const { data: plan } = await service
    .from("billing_plans")
    .select("*")
    .eq("slug", parsed.data.plan_slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!plan) return apiError("Plan not found.", 404);
  const targetPlan = plan as PlanRow;

  // Look up existing subscription
  const { data: existingSub } = await service
    .from("org_subscriptions")
    .select("*")
    .eq("org_id", parsed.data.org_id)
    .eq("status", "active")
    .maybeSingle();

  const billingMode = parsed.data.billing_mode;

  // If Stripe is configured, create a Checkout Session
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId =
    billingMode === "byok"
      ? targetPlan.stripe_byok_price_id
      : targetPlan.stripe_price_id;

  if (stripeSecretKey && stripePriceId) {
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeSecretKey);

      // Get or create Stripe customer
      let customerId: string | null =
        (existingSub as SubscriptionRow | null)?.stripe_customer_id ?? null;

      if (!customerId) {
        const customer = await stripe.customers.create({
          name: user.email ?? undefined,
          metadata: { user_id: user.id, org_id: parsed.data.org_id },
        });
        customerId = customer.id;

        // Save customer ID on subscription
        if (existingSub) {
          await service
            .from("org_subscriptions")
            .update({ stripe_customer_id: customerId } as never)
            .eq("id", (existingSub as SubscriptionRow).id);
        }
      }

      const successUrl =
        parsed.data.success_url ||
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/org/billing?upgraded=true`;
      const cancelUrl =
        parsed.data.cancel_url ||
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/org/billing?canceled=true`;

      // Create Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: stripePriceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          org_id: parsed.data.org_id,
          plan_id: targetPlan.id,
          billing_mode: billingMode,
        },
      });

      await writeAppLog(service, {
        userId: user.id,
        level: "info",
        source: "Billing",
        event: "billing.checkout_created",
        status: "completed",
        message: "Stripe checkout session created.",
        details: {
          org_id: parsed.data.org_id,
          plan: targetPlan.slug,
          billing_mode: billingMode,
        },
      });

      return NextResponse.json({ checkout_url: session.url });
    } catch (stripeErr) {
      console.error("Stripe checkout error:", stripeErr);
      return apiError("Failed to create checkout session.", 500);
    }
  }

  // No Stripe configured — direct plan change (for development/free plans)
  const now = new Date().toISOString();

  if (existingSub) {
    // Update existing subscription
    const { error } = await service
      .from("org_subscriptions")
      .update({
        plan_id: targetPlan.id,
        billing_mode: billingMode,
        status: "active",
        updated_at: now,
      } as never)
      .eq("id", (existingSub as SubscriptionRow).id);

    if (error) return apiError(error.message, 500);
  } else {
    // Create new subscription
    const { data: newSub, error } = await service
      .from("org_subscriptions")
      .insert({
        org_id: parsed.data.org_id,
        plan_id: targetPlan.id,
        billing_mode: billingMode,
        status: "active",
        seats_count: 1,
      } as never)
      .select("id")
      .maybeSingle();

    if (error || !newSub) return apiError(error?.message ?? "Failed to create subscription.", 500);

    // Link to org
    await service
      .from("organizations")
      .update({ subscription_id: newSub.id } as never)
      .eq("id", parsed.data.org_id);
  }

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Billing",
    event: "billing.plan_changed",
    status: "completed",
    message: `Plan changed to ${targetPlan.name}.`,
    details: {
      org_id: parsed.data.org_id,
      plan: targetPlan.slug,
      billing_mode: billingMode,
    },
  });

  return NextResponse.json({ updated: true, plan: targetPlan });
}
