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

const LEGACY_CREDITS_PER_USD = 1_000;

type ProfileRow = {
  tier: string | null;
  isAdmin: boolean;
  includedCreditsUsed: number;
  includedCreditsResetAt: string;
  purchasedCredits: number;
  storage: "credits" | "legacy-usd";
};

type RpcClient = ReturnType<typeof createServiceClient> & {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
};

async function fetchCreditProfile(userId: string): Promise<ProfileRow> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("tier, is_admin, included_credits_used, included_credits_reset_at, purchased_credits")
    .eq("id", userId)
    .single();

  if (!error && data) {
    const row = data as unknown as {
      tier: string | null;
      is_admin: boolean | null;
      included_credits_used: string | number;
      included_credits_reset_at: string;
      purchased_credits: string | number;
    };
    return {
      tier: row.tier,
      isAdmin: row.is_admin === true,
      includedCreditsUsed: Number(row.included_credits_used),
      includedCreditsResetAt: row.included_credits_reset_at,
      purchasedCredits: Number(row.purchased_credits),
      storage: "credits",
    };
  }

  // Keep reads working while the live database rolls through the credit-unit migration.
  const { data: legacyData, error: legacyError } = await service
    .from("profiles")
    .select("tier, is_admin, included_credits_used_usd, included_credits_reset_at, purchased_credits_usd")
    .eq("id", userId)
    .single();

  if (legacyError || !legacyData) throw new Error("Failed to fetch user credit balance");
  const legacyRow = legacyData as unknown as {
    tier: string | null;
    is_admin: boolean | null;
    included_credits_used_usd: string | number;
    included_credits_reset_at: string;
    purchased_credits_usd: string | number;
  };
  return {
    tier: legacyRow.tier,
    isAdmin: legacyRow.is_admin === true,
    includedCreditsUsed: Math.round(Number(legacyRow.included_credits_used_usd) * LEGACY_CREDITS_PER_USD),
    includedCreditsResetAt: legacyRow.included_credits_reset_at,
    purchasedCredits: Math.round(Number(legacyRow.purchased_credits_usd) * LEGACY_CREDITS_PER_USD),
    storage: "legacy-usd",
  };
}

async function maybeResetIncluded(userId: string, row: ProfileRow): Promise<number> {
  const resetAt = new Date(row.includedCreditsResetAt);
  const now = new Date();
  const needsReset =
    now.getUTCFullYear() > resetAt.getUTCFullYear() ||
    (now.getUTCFullYear() === resetAt.getUTCFullYear() &&
      now.getUTCMonth() > resetAt.getUTCMonth());

  if (!needsReset) return row.includedCreditsUsed;

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({
      [row.storage === "credits" ? "included_credits_used" : "included_credits_used_usd"]: 0,
      included_credits_reset_at: now.toISOString(),
    } as never)
    .eq("id", userId);
  if (error) throw error;
  return 0;
}

/** Fetch the current credit balance for a user (personal profile pool). */
export async function getUserCreditBalance(userId: string): Promise<CreditBalance> {
  const row = await fetchCreditProfile(userId);
  const includedCredits = getEntitlements(parseTier(row.tier)).includedAiCredits;
  const availablePurchased = Math.max(0, row.purchasedCredits);

  // Admins and unlimited-tier users have no credit ceiling.
  if (row.isAdmin || includedCredits === null) {
    return { availableIncluded: Infinity, availablePurchased, total: Infinity };
  }

  const includedUsed = await maybeResetIncluded(userId, row);

  const availableIncluded = Math.max(0, includedCredits - includedUsed);
  return { availableIncluded, availablePurchased, total: availableIncluded + availablePurchased };
}

/** Deduct integer credits atomically. Returns false when the balance is insufficient. */
export async function deductUserCredits(userId: string, amountCredits: number): Promise<boolean> {
  if (!Number.isSafeInteger(amountCredits) || amountCredits <= 0) return false;

  const service = createServiceClient();
  const row = await fetchCreditProfile(userId).catch(() => null);
  if (!row) return false;
  const includedCredits = getEntitlements(parseTier(row.tier)).includedAiCredits;
  // Admins and unlimited-tier users are never charged.
  if (row.isAdmin || includedCredits === null) return true;

  // Reset the monthly included allowance if the month rolled over — the RPC
  // reads included_credits_used and must see the reset value.
  const includedUsed = await maybeResetIncluded(userId, row);

  if (row.storage === "credits") {
    // The DB function computes the included/purchased split under the row lock
    // (migration 20260724120000). Pass only the total and the plan's included
    // limit, so two concurrent deductions can't both claim the same included
    // remainder from a stale snapshot and spuriously fail the second one.
    const { data, error: rpcError } = await (service as RpcClient).rpc("deduct_user_credits_raw", {
      p_user_id: userId,
      p_amount: amountCredits,
      p_included_limit: includedCredits,
    });
    if (rpcError) throw new Error(rpcError.message);
    return data === true;
  }

  // Legacy USD-denominated fallback (only reached on databases that predate the
  // credit-unit migration). Compute the split in the app for the old DECIMAL RPC.
  const currentPurchased = Math.max(0, row.purchasedCredits);
  const availableIncluded = Math.max(0, includedCredits - includedUsed);
  if (availableIncluded + currentPurchased < amountCredits) return false;
  const fromIncluded = Math.min(amountCredits, availableIncluded);
  const fromPurchased = amountCredits - fromIncluded;
  const { data, error: rpcError } = await (service as RpcClient).rpc("deduct_user_credits_raw", {
    p_user_id: userId,
    p_add_to_included: fromIncluded / LEGACY_CREDITS_PER_USD,
    p_sub_from_purchased: fromPurchased / LEGACY_CREDITS_PER_USD,
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
  if (!error) return;

  const { error: legacyError } = await (service as RpcClient).rpc("top_up_user_credits", {
    p_user_id: userId,
    p_amount_usd: amountCredits / LEGACY_CREDITS_PER_USD,
  });
  if (legacyError) throw new Error(error.message);
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
  if (!error) return data === true;

  // Temporary compatibility path for deployments where web code reaches the
  // old schema before the credit-unit migration has finished.
  const { data: existing, error: existingError } = await service
    .from("credit_purchases")
    .select("id")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();
  if (existingError) throw new Error(error.message);
  if (existing) return false;

  const { error: insertError } = await service.from("credit_purchases").insert({
    user_id: userId,
    amount_usd: priceUsd,
    stripe_session_id: stripeSessionId,
    stripe_payment_intent_id: stripePaymentIntentId,
    status: "completed",
  } as never);
  if (insertError) {
    if (insertError.code === "23505") return false;
    throw new Error(insertError.message);
  }

  try {
    await topUpUserCredits(userId, amountCredits);
  } catch (topUpError) {
    await service.from("credit_purchases").delete().eq("stripe_session_id", stripeSessionId);
    throw topUpError;
  }

  return true;
}
