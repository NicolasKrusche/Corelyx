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
import { parseCheckoutPaymentMethod } from "@/lib/checkout-payment-method";

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
  // Stripe's crypto payment method only supports one-time payments (mode: "payment"),
  // not recurring subscriptions. Reject it here so users get a clear message instead of
  // a generic Stripe failure. Crypto is still available for one-time AI credit packs.
  if (paymentMethod === "stablecoin") {
    return apiError(
      "Crypto payments aren't available for subscriptions. Please pay with a card, or buy one-time AI credit packs with crypto.",
      400
    );
  }
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
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/plan?checkout=success`,
      cancel_url: `${baseUrl}/plan?checkout=cancelled`,
      // Consumer withdrawal-right disclosure (FAGG § 18 / Art. 16(m) Directive
      // 2011/83/EU). Paid features become available immediately, so we surface —
      // directly above the pay button — that the customer requests immediate
      // performance and acknowledges losing the 14-day right of withdrawal once
      // the service has been fully performed. `custom_text.submit` needs no
      // Stripe Dashboard configuration, so this acknowledgment always renders.
      custom_text: {
        submit: {
          message:
            "By subscribing you request that Corelyx starts providing the paid service immediately and acknowledge that your 14-day right of withdrawal is lost once the service has been fully performed (§ 18 FAGG / Art. 16(m) Directive 2011/83/EU). You can cancel anytime in account settings; see our Terms of Service for details.",
        },
      },
      // Optional Stripe-recorded Terms-of-Service acceptance. `terms_of_service:
      // "required"` only works when a Terms of Service URL is configured under
      // Stripe Dashboard → Settings → Public details; without it Stripe rejects
      // the session. It is therefore opt-in via STRIPE_TOS_CONSENT so an
      // unconfigured account can never break checkout — set it to "true" once
      // /terms is registered as the Dashboard ToS URL.
      ...(process.env.STRIPE_TOS_CONSENT === "true"
        ? { consent_collection: { terms_of_service: "required" as const } }
        : {}),
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
        // Records that the immediate-performance / withdrawal-waiver
        // acknowledgment above was presented at checkout (FAGG § 18).
        withdrawal_ack: "immediate_performance_requested",
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
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("crypto") || msg.includes("payment_method_types") || msg.includes("invalid payment method")) {
      return apiError("Stablecoin payments are not currently available. Please pay with a card.", 400);
    }
    return apiError("Checkout could not be started.", 502);
  }

  if (!checkoutUrl) return apiError("Stripe checkout session did not include a redirect URL.", 500);
  if (returnJson) return NextResponse.json({ url: checkoutUrl });
  return NextResponse.redirect(checkoutUrl, { status: 303 });
}
