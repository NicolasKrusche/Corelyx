/**
 * Auto-recharge: when a user's credit balance drops below their configured threshold,
 * charge their saved Stripe payment method (if available) or email them a checkout link.
 */
import { createServiceClient } from "@/lib/api";
import { findCreditPack, formatCredits } from "@/lib/credit-packs";
import { getStripeClient } from "@/lib/stripe";
import { applyCreditPurchase, getUserCreditBalance } from "@/lib/credits";
import { sendEmail } from "@/lib/email";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

type AutoRechargeConfig = {
  is_enabled: boolean;
  threshold_credits: number;
  recharge_credits: number;
  last_triggered_at: string | null;
};

type ProfileRow = {
  email: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
};

export type AutoRechargeSettings = {
  isEnabled: boolean;
  thresholdCredits: number;
  rechargeCredits: number;
};

async function getStoredAutoRechargeConfig(userId: string): Promise<AutoRechargeConfig | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("auto_recharge_configs")
    .select("is_enabled, threshold_credits, recharge_credits, last_triggered_at")
    .eq("user_id", userId)
    .single();

  if (!error && data) return data as unknown as AutoRechargeConfig;

  const { data: legacyData } = await service
    .from("auto_recharge_configs")
    .select("is_enabled, threshold_usd, recharge_amount_usd, last_triggered_at")
    .eq("user_id", userId)
    .single();

  if (!legacyData) return null;
  const legacy = legacyData as unknown as {
    is_enabled: boolean;
    threshold_usd: string | number;
    recharge_amount_usd: string | number;
    last_triggered_at: string | null;
  };
  return {
    is_enabled: legacy.is_enabled,
    threshold_credits: Math.round(Number(legacy.threshold_usd) * 1_000),
    recharge_credits: Math.round(Number(legacy.recharge_amount_usd) * 1_000),
    last_triggered_at: legacy.last_triggered_at,
  };
}

export async function getAutoRechargeConfig(userId: string): Promise<AutoRechargeSettings> {
  const config = await getStoredAutoRechargeConfig(userId);
  if (!config) {
    return { isEnabled: false, thresholdCredits: 2_000, rechargeCredits: 10_000 };
  }

  return {
    isEnabled: config.is_enabled,
    thresholdCredits: Number(config.threshold_credits),
    rechargeCredits: Number(config.recharge_credits),
  };
}

export async function upsertAutoRechargeConfig(
  userId: string,
  settings: AutoRechargeSettings,
): Promise<void> {
  const service = createServiceClient();
  const { error } = await (service.from("auto_recharge_configs") as any).upsert(
    {
      user_id: userId,
      is_enabled: settings.isEnabled,
      threshold_credits: settings.thresholdCredits,
      recharge_credits: settings.rechargeCredits,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (!error) return;

  const { error: legacyError } = await (service.from("auto_recharge_configs") as any).upsert(
    {
      user_id: userId,
      is_enabled: settings.isEnabled,
      threshold_usd: settings.thresholdCredits / 1_000,
      recharge_amount_usd: settings.rechargeCredits / 1_000,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (legacyError) throw legacyError;
}

/** Check if auto-recharge should fire after a credit deduction. */
export async function maybeFireAutoRecharge(userId: string): Promise<void> {
  const service = createServiceClient();

  const cfg = await getStoredAutoRechargeConfig(userId);
  if (!cfg) return;
  if (!cfg.is_enabled) return;

  if (cfg.last_triggered_at) {
    const elapsed = Date.now() - new Date(cfg.last_triggered_at).getTime();
    if (elapsed < COOLDOWN_MS) return;
  }

  const balance = await getUserCreditBalance(userId);
  if (balance.total === Infinity || balance.total >= Number(cfg.threshold_credits)) return;

  // Claim the cooldown with a compare-and-swap so two near-simultaneous callers
  // (e.g. concurrent /api/internal/credits deductions) can't both pass the checks
  // above and double-charge the saved card. Only the caller that actually flips
  // last_triggered_at from the exact value it observed proceeds; the loser's
  // conditional update matches zero rows and bails.
  const claimedAt = new Date().toISOString();
  const claimBuilder = (service.from("auto_recharge_configs") as any)
    .update({ last_triggered_at: claimedAt })
    .eq("user_id", userId);
  const claimQuery =
    cfg.last_triggered_at === null
      ? claimBuilder.is("last_triggered_at", null)
      : claimBuilder.eq("last_triggered_at", cfg.last_triggered_at);
  const { data: claimedRows } = await claimQuery.select("user_id");
  if (!Array.isArray(claimedRows) || claimedRows.length === 0) return;

  const { data: profileData } = await service
    .from("profiles")
    .select("email, stripe_customer_id, stripe_payment_method_id")
    .eq("id", userId)
    .single();

  const profile = profileData as unknown as ProfileRow | null;
  const rechargeCredits = Number(cfg.recharge_credits);
  const pack = findCreditPack(rechargeCredits);
  if (!pack) throw new Error("Auto-recharge credit pack is invalid");

  if (profile?.stripe_customer_id && profile?.stripe_payment_method_id) {
    await chargeStoredPaymentMethod({
      userId,
      customerId: profile.stripe_customer_id,
      paymentMethodId: profile.stripe_payment_method_id,
      credits: pack.credits,
      priceUsd: pack.priceUsd,
      claimedAt,
    });
  } else if (profile?.email) {
    await sendLowBalanceEmail({
      to: profile.email,
      currentBalance: balance.total,
      rechargeCredits: pack.credits,
    });
  }
}

/**
 * Credit an auto-recharge payment exactly once, keyed on the Stripe
 * PaymentIntent id. Called from both the synchronous charge path (below) and the
 * async `payment_intent.succeeded` webhook — whichever runs first credits, the
 * other is a no-op. Reuses applyCreditPurchase's ON CONFLICT(stripe_session_id)
 * idempotency with the PaymentIntent id as the unique key (auto-recharge has no
 * Checkout session).
 */
export async function creditAutoRecharge(opts: {
  userId: string;
  paymentIntentId: string;
  credits: number;
  priceUsd: number;
}): Promise<void> {
  await applyCreditPurchase({
    userId: opts.userId,
    amountCredits: opts.credits,
    priceUsd: opts.priceUsd,
    stripeSessionId: opts.paymentIntentId,
    stripePaymentIntentId: opts.paymentIntentId,
  });
}

async function chargeStoredPaymentMethod({
  userId,
  customerId,
  paymentMethodId,
  credits,
  priceUsd,
  claimedAt,
}: {
  userId: string;
  customerId: string;
  paymentMethodId: string;
  credits: number;
  priceUsd: number;
  claimedAt: string;
}): Promise<void> {
  const stripe = getStripeClient();
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: Math.round(priceUsd * 100),
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `Corelyx auto-recharge - ${formatCredits(credits)} credits`,
        metadata: {
          type: "credits_auto_recharge",
          amount_credits: String(credits),
          price_usd: String(priceUsd),
          user_id: userId,
        },
      },
      // Stable idempotency key derived from the user + the claimed cooldown
      // timestamp: a retried invocation (or any duplicate caller that slipped
      // past the CAS claim) reuses the same PaymentIntent instead of charging
      // the card twice. The key rotates each cooldown window, well within
      // Stripe's 24h idempotency-key retention.
      { idempotencyKey: `auto-recharge:${userId}:${claimedAt}` },
    );

    if (pi.status === "succeeded") {
      // Idempotent credit keyed on the PaymentIntent id, so the async
      // payment_intent.succeeded webhook can't double-credit if it also fires.
      await creditAutoRecharge({ userId, paymentIntentId: pi.id, credits, priceUsd });
    }
    // Otherwise the intent is still "processing" (async payment method): the
    // payment_intent.succeeded webhook credits it later — see billing/webhook.
  } catch {
    const service = createServiceClient();
    const { data } = await service.from("profiles").select("email").eq("id", userId).single();
    const email = (data as { email: string | null } | null)?.email;
    if (email) {
      await sendLowBalanceEmail({ to: email, currentBalance: 0, rechargeCredits: credits });
    }
  }
}

async function sendLowBalanceEmail({
  to,
  currentBalance,
  rechargeCredits,
}: {
  to: string;
  currentBalance: number;
  rechargeCredits: number;
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.corelyx.app";
  const topUpUrl = `${appUrl}/credits#topup`;

  await sendEmail({
    to,
    subject: "Your Corelyx credit balance is low",
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:32px 40px 0;text-align:center;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Your credit balance is low</h1>
        <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.5;">
          Your Corelyx platform AI credit balance has dropped to <strong>${formatCredits(currentBalance)} credits</strong>.
          AI-powered workflow nodes may stop working once it reaches zero.
        </p>
      </td></tr>
      <tr><td style="padding:28px 40px;">
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${topUpUrl}" style="display:inline-block;background:#ea580c;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;">
            Top up ${formatCredits(rechargeCredits)} credits now
          </a>
        </div>
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
          You can manage auto-recharge settings on your <a href="${topUpUrl}" style="color:#ea580c;">credits page</a>.<br>
          Add a saved payment method to enable automatic top-ups.
        </p>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Corelyx - <a href="${appUrl}" style="color:#9ca3af;">${appUrl}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  });
}
