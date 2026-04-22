import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createServiceClient, apiError } from "@/lib/api";
import { getTierFromPriceId } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";

const ACTIVE_SUB_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "unpaid",
]);

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable.");
  return secret;
}

async function applySubscriptionToProfile(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;
  if (!userId) return;

  const status = subscription.status;
  const priceId = subscription.items.data[0]?.price?.id ?? "";
  const mappedTier = getTierFromPriceId(priceId);
  const isActive = ACTIVE_SUB_STATUSES.has(status);

  const tier = isActive && mappedTier ? mappedTier : "free";
  const planExpiresAt =
    isActive && subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

  const service = createServiceClient();
  await service
    .from("profiles")
    .update({ tier, plan_expires_at: planExpiresAt })
    .eq("id", userId);
}

export async function POST(request: Request) {
  const stripe = getStripeClient();

  let webhookSecret: string;
  try {
    webhookSecret = getWebhookSecret();
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Webhook is not configured.", 500);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return apiError("Missing stripe-signature header.", 400);

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return apiError("Invalid webhook signature.", 400);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string" && session.client_reference_id) {
        await stripe.subscriptions.update(session.subscription, {
          metadata: {
            user_id: session.client_reference_id,
          },
        });
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await applySubscriptionToProfile(subscription);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
