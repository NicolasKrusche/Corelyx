import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { getStripeClient } from "@/lib/stripe";
import { vaultDelete } from "@/lib/vault";

const CANCELABLE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

// DELETE /api/settings/account — permanently deletes the authenticated user's account.
// Order: cancel Stripe subscriptions → purge Vault secrets → delete auth user (cascades DB rows).
export async function DELETE() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient();

  // 1. Cancel Stripe subscriptions — non-fatal.
  if (user.email) {
    try {
      const stripe = getStripeClient();
      const { data: customers } = await stripe.customers.list({
        email: user.email,
        limit: 10,
      });
      for (const customer of customers) {
        if (customer.deleted) continue;
        const { data: subscriptions } = await stripe.subscriptions.list({
          customer: customer.id,
          limit: 20,
        });
        for (const sub of subscriptions) {
          if (CANCELABLE_STATUSES.has(sub.status)) {
            await stripe.subscriptions.cancel(sub.id);
          }
        }
      }
    } catch {
      // Stripe cleanup failure must not block account deletion.
    }
  }

  // 2. Collect all Vault secret IDs for this user across connections and API keys.
  const [connectionsRes, apiKeysRes] = await Promise.all([
    service
      .from("connections")
      .select("vault_secret_id")
      .eq("user_id", user.id),
    service
      .from("api_keys")
      .select("vault_secret_id")
      .eq("user_id", user.id),
  ]);

  type VaultRow = { vault_secret_id: string | null };
  const vaultIds = [
    ...((connectionsRes.data ?? []) as VaultRow[]),
    ...((apiKeysRes.data ?? []) as VaultRow[]),
  ]
    .map((r) => r.vault_secret_id)
    .filter((id): id is string => !!id);

  // 3. Delete each Vault secret — non-fatal per secret so a single bad ID doesn't abort deletion.
  for (const vaultId of vaultIds) {
    try {
      await vaultDelete(service, vaultId);
    } catch {
      // Log and continue — orphaned secrets are preferable to a stuck account.
    }
  }

  // 4. Remove contact from Resend audience — non-fatal.
  const resendAudienceId = process.env.RESEND_AUDIENCE_ID;
  if (resendAudienceId && user.email) {
    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        await fetch(
          `https://api.resend.com/audiences/${encodeURIComponent(resendAudienceId)}/contacts/${encodeURIComponent(user.email)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${resendKey}` },
            cache: "no-store",
          },
        );
      }
    } catch {
      // Resend cleanup failure must not block account deletion.
    }
  }

  // 5. Delete auth user — cascades to profiles, programs, runs, connections, api_keys via ON DELETE CASCADE.
  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) return apiError(error.message, 500);

  return NextResponse.json({ deleted: true });
}
