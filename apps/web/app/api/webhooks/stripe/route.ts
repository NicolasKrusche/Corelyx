import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { applyCreditPurchase } from "@/lib/credits";
import { createServiceClient } from "@/lib/api";
import { maybeFireAutoRecharge } from "@/lib/auto-recharge";

// POST /api/webhooks/stripe
// Verifies Stripe signature and processes checkout.session.completed events.
export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  const stripe = getStripeClient();
  let event: ReturnType<typeof stripe.webhooks.constructEventAsync> extends Promise<infer T> ? T : never;

  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Webhook signature verification failed: ${msg}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = session.metadata ?? {};

    if (metadata.type === "credits") {
      const userId = metadata.user_id;
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

        // Save reusable card details for future auto-recharge charges. Stripe's
        // stablecoin payment method is customer-authenticated and not reusable.
        const service = createServiceClient();
        const updates: Record<string, string> = {};
        const isStablecoinCheckout = metadata.checkout_payment_method === "stablecoin";

        if (!isStablecoinCheckout && session.customer && typeof session.customer === "string") {
          updates.stripe_customer_id = session.customer;
        }

        // Retrieve the payment intent to get the payment method
        if (!isStablecoinCheckout && session.payment_intent && typeof session.payment_intent === "string") {
          try {
            const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
            if (pi.payment_method && typeof pi.payment_method === "string") {
              updates.stripe_payment_method_id = pi.payment_method;
              // Attach payment method to customer so it can be reused
              if (session.customer && typeof session.customer === "string") {
                await stripe.paymentMethods.attach(pi.payment_method, {
                  customer: session.customer,
                }).catch(() => { /* already attached — ignore */ });
              }
            }
          } catch {
            // Non-fatal: PM save failing shouldn't block credit top-up
          }
        }

        if (Object.keys(updates).length > 0) {
          await service.from("profiles").update(updates as never).eq("id", userId);
        }

        // Trigger auto-recharge check in case balance was already low when payment completed
        await maybeFireAutoRecharge(userId).catch(() => { /* non-fatal */ });
      }
    }
  }

  return NextResponse.json({ received: true });
}
