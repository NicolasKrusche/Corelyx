import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import {
  getStripePriceId,
  parseBillingInterval,
  parsePaidTier,
  type BillingInterval,
  type PaidTier,
} from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";

function readString(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value === "string") return value;
  return null;
}

function getBaseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured;

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function parseInput(
  rawTier: string | null,
  rawInterval: string | null
): { tier: PaidTier; interval: BillingInterval } | null {
  const tier = parsePaidTier(rawTier);
  const interval = parseBillingInterval(rawInterval);
  if (!tier || !interval) return null;
  return { tier, interval };
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!user.email) return apiError("Account email is required for billing.", 400);

  const contentType = request.headers.get("content-type") ?? "";
  let rawTier: string | null = null;
  let rawInterval: string | null = null;
  let rawWelcomeOffer: string | null = null;

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { tier?: string; interval?: string; welcome_offer?: string } | null;
    rawTier = body?.tier ?? null;
    rawInterval = body?.interval ?? null;
    rawWelcomeOffer = body?.welcome_offer ?? null;
  } else {
    const form = await request.formData();
    rawTier = readString(form.get("tier"));
    rawInterval = readString(form.get("interval"));
    rawWelcomeOffer = readString(form.get("welcome_offer"));
  }

  const parsed = parseInput(rawTier, rawInterval);
  if (!parsed) return apiError("Invalid billing selection.", 400);

  const { tier, interval } = parsed;

  // Validate welcome offer eligibility server-side
  const isWelcomeOffer = rawWelcomeOffer === "true" && tier === "plus" && interval === "month";
  let welcomeCouponId: string | null = null;
  if (isWelcomeOffer) {
    const { data: profile } = await supabase.from("profiles").select("tier, created_at").eq("id", user.id).single();
    const tierNow = (profile as { tier?: string } | null)?.tier ?? "free";
    const createdAt = (profile as { created_at?: string } | null)?.created_at ?? "";
    const withinWindow = createdAt
      ? Date.now() - new Date(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000
      : false;
    if (tierNow === "free" && withinWindow) {
      welcomeCouponId = process.env.STRIPE_WELCOME_COUPON_ID ?? null;
    }
  }

  let priceId: string;
  try {
    priceId = getStripePriceId(tier, interval);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Billing is not configured.", 500);
  }

  const baseUrl = getBaseUrl(request);
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/plan?checkout=success`,
    cancel_url: `${baseUrl}/plan?checkout=cancelled`,
    ...(welcomeCouponId
      ? { discounts: [{ coupon: welcomeCouponId }] }
      : { allow_promotion_codes: true }),
    client_reference_id: user.id,
    metadata: {
      user_id: user.id,
      requested_tier: tier,
      requested_interval: interval,
    },
    subscription_data: {
      metadata: {
        user_id: user.id,
        tier,
        interval,
      },
    },
  });

  if (!session.url) return apiError("Stripe checkout session did not include a redirect URL.", 500);
  return NextResponse.redirect(session.url, { status: 303 });
}
