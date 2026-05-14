import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getStripeClient } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase/server";

const CREDIT_PACKS = [5, 10, 25, 50] as const;
type CreditPack = (typeof CREDIT_PACKS)[number];

// POST /api/credits/checkout
// Body: { amount_usd: 5 | 10 | 25 | 50 }
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

  const amountUsd = (body as Record<string, unknown>)?.amount_usd as number | undefined;
  if (!amountUsd || !CREDIT_PACKS.includes(amountUsd as CreditPack)) {
    return apiError(`amount_usd must be one of: ${CREDIT_PACKS.join(", ")}`, 400);
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

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: stripeCustomerId,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountUsd * 100,
          product_data: {
            name: `${amountUsd} AI Credit Pack`,
            description: `$${amountUsd} of platform AI credits — use across all LLM nodes`,
          },
        },
      },
    ],
    metadata: {
      type: "credits",
      amount_usd: String(amountUsd),
      user_id: user.id,
    },
    success_url: `${origin}/dashboard?credits=purchased`,
    cancel_url: `${origin}/dashboard?credits=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
