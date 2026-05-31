/**
 * Server-side credit balance helpers.
 * Credits come from two pools:
 *   1. included_credits_used - consumed from the monthly plan allowance (resets monthly)
 *   2. purchased_credits     - top-up pool that never expires
 *
 * Deduction drains included first, then purchased.
 */
import { createServiceClient } from "@/lib/api";
import { getEntitlements, parseTier } from "@/lib/entitlements";

export type CreditBalance = {
  availableIncluded: number;
  availablePurchased: number;
  /** Infinity when on unlimited plan. */
  total: number;
};

type ProfileRow = {
  tier: string | null;
  included_credits_used: string | number;
  included_credits_reset_at: string;
  purchased_credits: string | number;
};

type RpcClient = ReturnType<typeof createServiceClient> & {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
};

async function maybeResetIncluded(userId: string, row: ProfileRow): Promise<number> {
  const resetAt = new Date(row.included_credits_reset_at);
  const now = new Date();
  const needsReset =
    now.getUTCFullYear() > resetAt.getUTCFullYear() ||
    (now.getUTCFullYear() === resetAt.getUTCFullYear() &&
      now.getUTCMonth() > resetAt.getUTCMonth());

  if (!needsReset) return Number(row.included_credits_used);

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({
      included_credits_used: 0,
      included_credits_reset_at: now.toISOString(),
    } as never)
    .eq("id", userId);
  if (error) throw error;
  return 0;
}

/** Fetch the current credit balance for a user (personal profile pool). */
export async function getUserCreditBalance(userId: string): Promise<CreditBalance> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("tier, included_credits_used, included_credits_reset_at, purchased_credits")
    .eq("id", userId)
    .single();

  if (error || !data) throw new Error("Failed to fetch user credit balance");
  const row = data as unknown as ProfileRow;

  const includedCredits = getEntitlements(parseTier(row.tier)).includedAiCredits;
  const includedUsed = await maybeResetIncluded(userId, row);
  const availablePurchased = Math.max(0, Number(row.purchased_credits));

  if (includedCredits === null) {
    return { availableIncluded: Infinity, availablePurchased, total: Infinity };
  }

  const availableIncluded = Math.max(0, includedCredits - includedUsed);
  return { availableIncluded, availablePurchased, total: availableIncluded + availablePurchased };
}

/** Deduct integer credits atomically. Returns false when the balance is insufficient. */
export async function deductUserCredits(userId: string, amountCredits: number): Promise<boolean> {
  if (!Number.isSafeInteger(amountCredits) || amountCredits <= 0) return false;

  const service = createServiceClient();
  const { data: rawRow, error } = await service
    .from("profiles")
    .select("tier, included_credits_used, included_credits_reset_at, purchased_credits")
    .eq("id", userId)
    .single();

  if (error || !rawRow) return false;
  const row = rawRow as unknown as ProfileRow;

  const includedCredits = getEntitlements(parseTier(row.tier)).includedAiCredits;
  if (includedCredits === null) return true;

  const includedUsed = await maybeResetIncluded(userId, row);
  const currentPurchased = Math.max(0, Number(row.purchased_credits));
  const availableIncluded = Math.max(0, includedCredits - includedUsed);
  if (availableIncluded + currentPurchased < amountCredits) return false;

  const fromIncluded = Math.min(amountCredits, availableIncluded);
  const fromPurchased = amountCredits - fromIncluded;
  const { data, error: rpcError } = await (service as RpcClient).rpc("deduct_user_credits_raw", {
    p_user_id: userId,
    p_add_to_included: fromIncluded,
    p_sub_from_purchased: fromPurchased,
    p_included_limit: includedCredits,
  });
  if (rpcError) throw new Error(rpcError.message);
  return data === true;
}

/** Add integer credits to a user's purchased pool after Stripe payment. */
export async function topUpUserCredits(userId: string, amountCredits: number): Promise<void> {
  if (!Number.isSafeInteger(amountCredits) || amountCredits <= 0) {
    throw new Error("Credit top-up must be a positive integer");
  }

  const service = createServiceClient();
  const { error } = await (service as RpcClient).rpc("top_up_user_credits", {
    p_user_id: userId,
    p_amount_credits: amountCredits,
  });
  if (error) throw new Error(error.message);
}

/** Record and apply a Stripe Checkout purchase exactly once. */
export async function applyCreditPurchase({
  userId,
  amountCredits,
  priceUsd,
  stripeSessionId,
  stripePaymentIntentId,
}: {
  userId: string;
  amountCredits: number;
  priceUsd: number;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
}): Promise<boolean> {
  if (!Number.isSafeInteger(amountCredits) || amountCredits <= 0 || priceUsd <= 0) {
    throw new Error("Credit purchase is invalid");
  }

  const service = createServiceClient();
  const { data, error } = await (service as RpcClient).rpc("apply_credit_purchase", {
    p_user_id: userId,
    p_amount_credits: amountCredits,
    p_price_usd: priceUsd,
    p_stripe_session_id: stripeSessionId,
    p_stripe_payment_intent_id: stripePaymentIntentId,
  });
  if (error) throw new Error(error.message);
  return data === true;
}
