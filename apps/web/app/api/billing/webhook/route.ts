import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createServiceClient, apiError } from "@/lib/api";
import { getTierFromPriceId } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";
import { applyCreditPurchase } from "@/lib/credits";
import { creditAutoRecharge, maybeFireAutoRecharge } from "@/lib/auto-recharge";
import { AI_INFERENCE_PROVIDERS } from "@/lib/connector-tiers";
import { getEntitlements, parseTier } from "@/lib/entitlements";

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
  // Stripe's 2025 "Basil" API moved current_period_end off the subscription and
  // onto each subscription item. Read the top-level field for older API versions,
  // then fall back to the item-level field so plan_expires_at (renewal date) is
  // never silently written null on modern accounts.
  const topLevelPeriodEnd =
    (subscription as Stripe.Subscription & { current_period_end?: number | null })
      .current_period_end ?? null;
  const itemPeriodEnd =
    (subscription.items.data[0] as unknown as { current_period_end?: number | null } | undefined)
      ?.current_period_end ?? null;
  const currentPeriodEnd = topLevelPeriodEnd ?? itemPeriodEnd;
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
  } else {
    await service
      .from("profiles")
      .update({ tier, plan_expires_at: planExpiresAt } as never)
      .eq("id", userId);
  }

  await syncGatedConnections(service, { tier, userId, workspaceId });
}

/**
 * Reconcile gated connectors with the tier we just wrote.
 *
 * Downgrading to a plan without BYOK disables AI-inference connections; coming
 * back up re-enables the ones we disabled. Without this the row keeps its
 * credential and the user keeps seeing it listed as connected, while every run
 * fails a 403 at the token endpoint with no explanation of why.
 *
 * Disabled, never deleted: the Vault secret and the workflow wiring survive, so
 * resubscribing restores a working setup instead of forcing a re-auth of every
 * connector. Only rows we disabled are re-enabled — a connection disabled for
 * any other reason is left alone.
 *
 * Best-effort by design. Stripe retries on non-2xx, and a failure here must not
 * cost the user the tier change itself, which is the part they paid for.
 */
async function syncGatedConnections(
  service: ReturnType<typeof createServiceClient>,
  { tier, userId, workspaceId }: { tier: string; userId?: string; workspaceId?: string },
) {
  const scopeColumn = workspaceId ? "workspace_id" : "user_id";
  const scopeValue = workspaceId ?? userId;
  if (!scopeValue) return;

  const entitled = getEntitlements(parseTier(tier)).byok;

  try {
    const { error } = entitled
      ? await service
          .from("connections")
          .update({ disabled_reason: null } as never)
          .eq(scopeColumn, scopeValue)
          .eq("disabled_reason", "tier_downgrade")
      : await service
          .from("connections")
          .update({ disabled_reason: "tier_downgrade" } as never)
          .eq(scopeColumn, scopeValue)
          .in("provider", [...AI_INFERENCE_PROVIDERS])
          .is("disabled_reason", null);

    if (error) {
      console.error("[billing/webhook] syncGatedConnections failed:", error.message);
    }
  } catch (err) {
    console.error("[billing/webhook] syncGatedConnections threw:", err);
  }
}

export async function POST(request: Request) {
  let stripe: ReturnType<typeof getStripeClient>;
  let webhookSecret: string;
  try {
    stripe = getStripeClient();
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

    case "payment_intent.succeeded": {
      // Catch-up for auto-recharge payments that settle asynchronously: the
      // synchronous charge path only credits when the intent returns "succeeded"
      // immediately, so a "processing" intent (e.g. delayed card auth) would be
      // charged but never credited without this. Idempotent vs the synchronous
      // path — both credit through creditAutoRecharge, keyed on the intent id.
      const pi = event.data.object as Stripe.PaymentIntent;
      const metadata = pi.metadata ?? {};
      if (metadata.type === "credits_auto_recharge") {
        const userId = metadata.user_id;
        const amountCredits = Number.parseInt(metadata.amount_credits ?? "0", 10);
        const priceUsd = Number.parseFloat(metadata.price_usd ?? "0");
        if (userId && Number.isSafeInteger(amountCredits) && amountCredits > 0 && priceUsd > 0) {
          await creditAutoRecharge({ userId, paymentIntentId: pi.id, credits: amountCredits, priceUsd });
        }
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
