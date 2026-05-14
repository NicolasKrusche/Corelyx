import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createServiceClient, apiError } from "@/lib/api";
import { getTierFromPriceId } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";
import { topUpUserCredits } from "@/lib/credits";

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

async function applySubscriptionToWorkspace(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;
  const workspaceId = subscription.metadata?.workspace_id;
  if (!userId && !workspaceId) return;

  const status = subscription.status;
  const priceId = subscription.items.data[0]?.price?.id ?? "";
  const mappedTier = getTierFromPriceId(priceId);
  const isActive = ACTIVE_SUB_STATUSES.has(status);
  const currentPeriodEnd =
    (subscription as Stripe.Subscription & { current_period_end?: number | null })
      .current_period_end ?? null;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : "id" in subscription.customer
        ? subscription.customer.id
        : null;

  const tier = isActive && mappedTier ? mappedTier : "free";
  const planExpiresAt =
    isActive && currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null;

  const service = createServiceClient();
  if (workspaceId) {
    await service
      .from("workspaces")
      .update({
        tier,
        plan_expires_at: planExpiresAt,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
      } as never)
      .eq("id", workspaceId);
    return;
  }

  await service
    .from("profiles")
    .update({ tier, plan_expires_at: planExpiresAt } as never)
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

      if (session.metadata?.type === "credits") {
        // One-time credit top-up purchase
        const userId = session.metadata.user_id ?? session.client_reference_id;
        const amountUsd = parseFloat(session.metadata.amount_usd ?? "0");
        if (userId && amountUsd > 0) {
          const service = createServiceClient();
          // Record in audit log
          await service.from("credit_purchases").insert({
            user_id: userId,
            amount_usd: amountUsd,
            stripe_session_id: session.id,
            stripe_payment_intent_id:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
            status: "completed",
          } as never);
          // Credit the user's pool
          await topUpUserCredits(userId, amountUsd);
        }
      } else if (typeof session.subscription === "string" && session.client_reference_id) {
        // Subscription checkout — attach user metadata to subscription
        await stripe.subscriptions.update(session.subscription, {
          metadata: {
            user_id: session.client_reference_id,
            workspace_id: session.metadata?.workspace_id ?? "",
          },
        });
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await applySubscriptionToWorkspace(subscription);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
