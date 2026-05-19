/**
 * Auto-recharge: when a user's credit balance drops below their configured threshold,
 * charge their saved Stripe payment method (if available) or email them a checkout link.
 *
 * Call maybeFireAutoRecharge(userId) fire-and-forget after any credit deduction.
 * It is idempotent: won't fire more than once per 24 h per user.
 */

import { createServiceClient } from "@/lib/api";
import { getStripeClient } from "@/lib/stripe";
import { topUpUserCredits, getUserCreditBalance } from "@/lib/credits";
import { sendEmail } from "@/lib/email";

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 h

type AutoRechargeConfig = {
  is_enabled: boolean;
  threshold_usd: number;
  recharge_amount_usd: number;
  last_triggered_at: string | null;
};

type ProfileRow = {
  email: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
};

export type AutoRechargeSettings = {
  isEnabled: boolean;
  thresholdUsd: number;
  rechargeAmountUsd: number;
};

export async function getAutoRechargeConfig(userId: string): Promise<AutoRechargeSettings> {
  const service = createServiceClient();
  const { data } = await service
    .from("auto_recharge_configs")
    .select("is_enabled, threshold_usd, recharge_amount_usd")
    .eq("user_id", userId)
    .single();

  if (!data) {
    return { isEnabled: false, thresholdUsd: 2.0, rechargeAmountUsd: 10.0 };
  }

  const row = data as unknown as AutoRechargeConfig;
  return {
    isEnabled: row.is_enabled,
    thresholdUsd: Number(row.threshold_usd),
    rechargeAmountUsd: Number(row.recharge_amount_usd),
  };
}

export async function upsertAutoRechargeConfig(
  userId: string,
  settings: AutoRechargeSettings,
): Promise<void> {
  const service = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (service.from("auto_recharge_configs") as any).upsert(
    {
      user_id: userId,
      is_enabled: settings.isEnabled,
      threshold_usd: settings.thresholdUsd,
      recharge_amount_usd: settings.rechargeAmountUsd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

/**
 * Check if auto-recharge should fire and, if so, charge the saved payment method.
 * Call this fire-and-forget after every credit deduction.
 */
export async function maybeFireAutoRecharge(userId: string): Promise<void> {
  const service = createServiceClient();

  const { data: cfgData } = await service
    .from("auto_recharge_configs")
    .select("is_enabled, threshold_usd, recharge_amount_usd, last_triggered_at")
    .eq("user_id", userId)
    .single();

  if (!cfgData) return;
  const cfg = cfgData as unknown as AutoRechargeConfig;
  if (!cfg.is_enabled) return;

  // Cooldown: don't fire more than once per 24 h
  if (cfg.last_triggered_at) {
    const elapsed = Date.now() - new Date(cfg.last_triggered_at).getTime();
    if (elapsed < COOLDOWN_MS) return;
  }

  const balance = await getUserCreditBalance(userId);
  if (balance.total === Infinity) return; // unlimited plan
  if (balance.total >= Number(cfg.threshold_usd)) return;

  // Mark as triggered before charging to prevent double-fires under concurrency
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (service.from("auto_recharge_configs") as any)
    .update({ last_triggered_at: new Date().toISOString() })
    .eq("user_id", userId);

  const { data: profileData } = await service
    .from("profiles")
    .select("email, stripe_customer_id, stripe_payment_method_id")
    .eq("id", userId)
    .single();

  const profile = profileData as unknown as ProfileRow | null;
  const rechargeAmount = Number(cfg.recharge_amount_usd);

  if (profile?.stripe_customer_id && profile?.stripe_payment_method_id) {
    await chargeStoredPaymentMethod({
      userId,
      customerId: profile.stripe_customer_id,
      paymentMethodId: profile.stripe_payment_method_id,
      amountUsd: rechargeAmount,
    });
  } else if (profile?.email) {
    await sendLowBalanceEmail({
      to: profile.email,
      currentBalance: balance.total,
      rechargeAmount,
    });
  }
}

async function chargeStoredPaymentMethod({
  userId,
  customerId,
  paymentMethodId,
  amountUsd,
}: {
  userId: string;
  customerId: string;
  paymentMethodId: string;
  amountUsd: number;
}): Promise<void> {
  const stripe = getStripeClient();
  try {
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(amountUsd * 100),
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `Corelyx auto-recharge — $${amountUsd} credits`,
      metadata: { type: "credits_auto_recharge", amount_usd: String(amountUsd), user_id: userId },
    });

    if (pi.status === "succeeded") {
      await topUpUserCredits(userId, amountUsd);
    }
  } catch {
    // If off-session charge fails (card requires auth), fall back to email
    const service = createServiceClient();
    const { data } = await service.from("profiles").select("email").eq("id", userId).single();
    const email = (data as { email: string | null } | null)?.email;
    if (email) {
      await sendLowBalanceEmail({ to: email, currentBalance: 0, rechargeAmount: amountUsd });
    }
  }
}

async function sendLowBalanceEmail({
  to,
  currentBalance,
  rechargeAmount,
}: {
  to: string;
  currentBalance: number;
  rechargeAmount: number;
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.corelyx.app";
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
          Your Corelyx platform AI credit balance has dropped to <strong>$${currentBalance.toFixed(2)}</strong>.
          AI-powered workflow nodes may stop working once it reaches zero.
        </p>
      </td></tr>
      <tr><td style="padding:28px 40px;">
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${topUpUrl}" style="display:inline-block;background:#ea580c;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;">
            Top up $${rechargeAmount.toFixed(2)} now
          </a>
        </div>
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
          You can manage auto-recharge settings on your <a href="${topUpUrl}" style="color:#ea580c;">credits page</a>.<br>
          Add a saved payment method to enable automatic top-ups.
        </p>
      </td></tr>
      <tr><td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Corelyx · <a href="${appUrl}" style="color:#9ca3af;">${appUrl}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  });
}
