/**
 * Server-side credit balance helpers.
 * Credits come from two pools:
 *   1. included_credits_used_usd — consumed from the monthly plan allowance (resets monthly)
 *   2. purchased_credits_usd     — top-up pool that never expires
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
  included_credits_used_usd: string | number;
  included_credits_reset_at: string;
  purchased_credits_usd: string | number;
};

async function maybeResetIncluded(userId: string, row: ProfileRow): Promise<number> {
  const resetAt = new Date(row.included_credits_reset_at);
  const now = new Date();
  const needsReset =
    now.getUTCFullYear() > resetAt.getUTCFullYear() ||
    (now.getUTCFullYear() === resetAt.getUTCFullYear() &&
      now.getUTCMonth() > resetAt.getUTCMonth());

  if (!needsReset) return Number(row.included_credits_used_usd);

  const service = createServiceClient();
  await service
    .from("profiles")
    .update({
      included_credits_used_usd: 0,
      included_credits_reset_at: now.toISOString(),
    } as never)
    .eq("id", userId);
  return 0;
}

/** Fetch the current credit balance for a user (personal profile pool). */
export async function getUserCreditBalance(userId: string): Promise<CreditBalance> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("tier, included_credits_used_usd, included_credits_reset_at, purchased_credits_usd")
    .eq("id", userId)
    .single();

  if (error || !data) throw new Error("Failed to fetch user credit balance");
  const row = data as unknown as ProfileRow;

  const entitlements = getEntitlements(parseTier(row.tier));
  const includedUsd = entitlements.includedAiCreditsUsd;
  const includedUsed = await maybeResetIncluded(userId, row);
  const availablePurchased = Math.max(0, Number(row.purchased_credits_usd));

  if (includedUsd === null) {
    return { availableIncluded: Infinity, availablePurchased, total: Infinity };
  }

  const availableIncluded = Math.max(0, includedUsd - includedUsed);
  return { availableIncluded, availablePurchased, total: availableIncluded + availablePurchased };
}

/**
 * Deduct credits from a user's account atomically via DB RPC.
 * Returns false if insufficient balance — caller should abort the LLM call.
 */
export async function deductUserCredits(
  userId: string,
  amountUsd: number,
): Promise<boolean> {
  const service = createServiceClient();
  const { data: rawRow, error } = await service
    .from("profiles")
    .select("tier, included_credits_used_usd, included_credits_reset_at, purchased_credits_usd")
    .eq("id", userId)
    .single();

  if (error || !rawRow) return false;
  const row = rawRow as unknown as ProfileRow;

  const entitlements = getEntitlements(parseTier(row.tier));
  const includedUsd = entitlements.includedAiCreditsUsd;

  // Unlimited plan — always allow
  if (includedUsd === null) return true;

  const includedUsed = await maybeResetIncluded(userId, row);
  const currentPurchased = Math.max(0, Number(row.purchased_credits_usd));
  const availableIncluded = Math.max(0, includedUsd - includedUsed);
  const total = availableIncluded + currentPurchased;

  if (total < amountUsd) return false;

  // Compute split
  let remaining = amountUsd;
  const fromIncluded = Math.min(remaining, availableIncluded);
  remaining -= fromIncluded;
  const fromPurchased = remaining;

  // Atomic RPC deduction
  const { data: rpcResult, error: rpcError } = await service.rpc(
    "deduct_user_credits_raw" as never,
    {
      p_user_id: userId,
      p_add_to_included: round6(fromIncluded),
      p_sub_from_purchased: round6(fromPurchased),
    },
  );

  if (rpcError) {
    // RPC unavailable — fall back to direct update (best-effort)
    await service
      .from("profiles")
      .update({
        included_credits_used_usd: round6(includedUsed + fromIncluded),
        purchased_credits_usd: round6(currentPurchased - fromPurchased),
      } as never)
      .eq("id", userId);
    return true;
  }

  return rpcResult === true;
}

/** Add to a user's purchased credit pool (called after Stripe payment). */
export async function topUpUserCredits(
  userId: string,
  amountUsd: number,
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.rpc("top_up_user_credits" as never, {
    p_user_id: userId,
    p_amount_usd: round6(amountUsd),
  });
  if (error) {
    // RPC unavailable — fetch-then-update fallback
    const { data } = await service
      .from("profiles")
      .select("purchased_credits_usd")
      .eq("id", userId)
      .single();
    const current = data
      ? Math.max(0, Number((data as { purchased_credits_usd: string | number }).purchased_credits_usd))
      : 0;
    await service
      .from("profiles")
      .update({ purchased_credits_usd: round6(current + amountUsd) } as never)
      .eq("id", userId);
  }
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
