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
import { getActiveWorkspace } from "@/lib/workspaces";
import { parseCheckoutPaymentMethod, stripePaymentMethodTypes } from "@/lib/checkout-payment-method";

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
  const contentType = request.headers.get("content-type") ?? "";
  const returnJson = contentType.includes("application/json");
  let rawTier: string | null = null;
  let rawInterval: string | null = null;
  let rawWelcomeOffer: string | null = null;
  let rawPaymentMethod: string | null = null;

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { tier?: string; interval?: string; welcome_offer?: string; payment_method?: string } | null;
    rawTier = body?.tier ?? null;
    rawInterval = body?.interval ?? null;
    rawWelcomeOffer = body?.welcome_offer ?? null;
    rawPaymentMethod = body?.payment_method ?? null;
  } else {
    const form = await request.formData();
    rawTier = readString(form.get("tier"));
    rawInterval = readString(form.get("interval"));
    rawWelcomeOffer = readString(form.get("welcome_offer"));
    rawPaymentMethod = readString(form.get("payment_method"));
  }

  const parsed = parseInput(rawTier, rawInterval);
  if (!parsed) return apiError("Invalid billing selection.", 400);

  const { tier, interval } = parsed;
  const paymentMethod = parseCheckoutPaymentMethod(rawPaymentMethod);
  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) return apiError("No active workspace.", 400);

  // Validate welcome offer eligibility server-side
  const isWelcomeOffer = rawWelcomeOffer === "true" && tier === "plus" && interval === "month";
  let welcomeCouponId: string | null = null;
  if (isWelcomeOffer) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("tier, created_at")
      .eq("id", activeWorkspace.workspaceId)
      .single();
    const tierNow = (workspace as { tier?: string } | null)?.tier ?? "free";
    const createdAt = (workspace as { created_at?: string } | null)?.created_at ?? "";
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
  let checkoutUrl: string | null;
  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(user.email ? { customer_email: user.email } : {}),
      payment_method_types: stripePaymentMethodTypes(paymentMethod),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/plan?checkout=success`,
      cancel_url: `${baseUrl}/plan?checkout=cancelled`,
      ...(welcomeCouponId
        ? { discounts: [{ coupon: welcomeCouponId }] }
        : { allow_promotion_codes: true }),
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        workspace_id: activeWorkspace.workspaceId,
        requested_tier: tier,
        requested_interval: interval,
        checkout_payment_method: paymentMethod,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          workspace_id: activeWorkspace.workspaceId,
          tier,
          interval,
        },
      },
    });
    checkoutUrl = session.url;
  } catch {
    return apiError("Checkout could not be started.", 502);
  }

  if (!checkoutUrl) return apiError("Stripe checkout session did not include a redirect URL.", 500);
  if (returnJson) return NextResponse.json({ url: checkoutUrl });
  return NextResponse.redirect(checkoutUrl, { status: 303 });
}
