import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createServiceClient, apiError } from "@/lib/api";
import { getTierFromPriceId } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";
import { applyCreditPurchase } from "@/lib/credits";
import { maybeFireAutoRecharge } from "@/lib/auto-recharge";

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
      const metadata = session.metadata ?? {};

      if (metadata.type === "credits") {
        // One-time credit top-up — idempotent via stripe_session_id
        const userId = metadata.user_id ?? session.client_reference_id;
        const amountCredits = Number.parseInt(metadata.amount_credits ?? "0", 10);
        const priceUsd = Number.parseFloat(metadata.price_usd ?? "0");

        if (userId && Number.isSafeInteger(amountCredits) && amountCredits > 0 && priceUsd > 0) {
          await applyCreditPurchase({
            userId,
            amountCredits,
            priceUsd,
            stripeSessionId: session.id,
            stripePaymentIntentId:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
          });

          // Save reusable card details for future auto-recharge charges.
          const service = createServiceClient();
          const updates: Record<string, string> = {};
          const isStablecoin = metadata.checkout_payment_method === "stablecoin";

          if (!isStablecoin && session.customer && typeof session.customer === "string") {
            updates.stripe_customer_id = session.customer;
          }

          if (!isStablecoin && typeof session.payment_intent === "string") {
            try {
              const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
              if (pi.payment_method && typeof pi.payment_method === "string") {
                updates.stripe_payment_method_id = pi.payment_method;
                if (session.customer && typeof session.customer === "string") {
                  await stripe.paymentMethods
                    .attach(pi.payment_method, { customer: session.customer })
                    .catch(() => { /* already attached */ });
                }
              }
            } catch {
              // Non-fatal: PM save failing shouldn't block credit top-up
            }
          }

          if (Object.keys(updates).length > 0) {
            await service.from("profiles").update(updates as never).eq("id", userId);
          }

          // Trigger auto-recharge check in case balance was already low
          await maybeFireAutoRecharge(userId).catch(() => { /* non-fatal */ });
        }
      } else if (typeof session.subscription === "string" && session.client_reference_id) {
        // Subscription checkout — attach user metadata to the subscription object
        await stripe.subscriptions.update(session.subscription, {
          metadata: {
            user_id: session.client_reference_id,
            workspace_id: metadata.workspace_id ?? "",
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
