import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getStripeClient } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase/server";
import { CREDIT_PACKS, findCreditPack, formatCredits } from "@/lib/credit-packs";
import { parseCheckoutPaymentMethod, stripePaymentMethodTypes } from "@/lib/checkout-payment-method";

// POST /api/credits/checkout
// Body: { amount_credits: 5000 | 10000 | 26250 | 55000, payment_method?: "stablecoin" }
// Creates a Stripe Checkout session for a one-time credit top-up.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const amountCredits = (body as Record<string, unknown>)?.amount_credits as number | undefined;
  const paymentMethod = parseCheckoutPaymentMethod((body as Record<string, unknown>)?.payment_method);
  const pack = amountCredits ? findCreditPack(amountCredits) : undefined;
  if (!pack) {
    return apiError(`amount_credits must be one of: ${CREDIT_PACKS.map(({ credits }) => credits).join(", ")}`, 400);
  }

  // Fetch Stripe customer ID if available
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  const stripeCustomerId = (profile as null | { stripe_customer_id: string | null })?.stripe_customer_id ?? undefined;

  const stripe = getStripeClient();
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      payment_method_types: stripePaymentMethodTypes(paymentMethod),
      ...(paymentMethod === "card"
        ? { payment_intent_data: { setup_future_usage: "off_session" as const } }
        : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pack.priceUsd * 100,
            product_data: {
              name: `${formatCredits(pack.credits)} AI Credit Pack`,
              description: `${formatCredits(pack.credits)} platform AI credits - use across all LLM nodes`,
            },
          },
        },
      ],
      metadata: {
        type: "credits",
        amount_credits: String(pack.credits),
        price_usd: String(pack.priceUsd),
        user_id: user.id,
        checkout_payment_method: paymentMethod,
      },
      success_url: `${origin}/dashboard?credits=purchased`,
      cancel_url: `${origin}/dashboard?credits=cancelled`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("crypto") || msg.includes("payment_method_types") || msg.includes("invalid payment method")) {
      return apiError("Stablecoin payments are not currently available. Please pay with a card.", 400);
    }
    return apiError("Checkout could not be started.", 502);
  }

  if (!session.url) return apiError("Stripe checkout session did not include a redirect URL.", 500);
  return NextResponse.json({ url: session.url });
}
