import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { getStripeClient } from "@/lib/stripe";
import { vaultDelete } from "@/lib/vault";
import { serverLog } from "@/lib/server-log";

const CANCELABLE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

type DeletionAuditTable = {
  insert(values: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
};

type DeletionAuditClient = ReturnType<typeof createServiceClient> & {
  from(table: "account_deletion_audit"): DeletionAuditTable;
};

type CleanupError = {
  step: string;
  message: string;
};

function hashEmail(email: string | null | undefined) {
  if (!email) return null;
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

// DELETE /api/settings/account - permanently deletes the authenticated user's account.
// Order: cancel external subscriptions, purge Vault secrets, delete auth user, then retain a pseudonymous deletion receipt.
export async function DELETE() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient();
  const auditService = service as DeletionAuditClient;
  const errors: CleanupError[] = [];
  let stripeCustomersSeen = 0;
  let stripeSubscriptionsCancelled = 0;
  let vaultSecretsDeleted = 0;
  let resendContactDeleted = false;
  let authUserDeleted = false;

  if (user.email) {
    try {
      const stripe = getStripeClient();
      const { data: customers } = await stripe.customers.list({
        email: user.email,
        limit: 10,
      });
      stripeCustomersSeen = customers.length;

      for (const customer of customers) {
        if (customer.deleted) continue;
        const { data: subscriptions } = await stripe.subscriptions.list({
          customer: customer.id,
          limit: 20,
        });
        for (const sub of subscriptions) {
          if (CANCELABLE_STATUSES.has(sub.status)) {
            await stripe.subscriptions.cancel(sub.id);
            stripeSubscriptionsCancelled += 1;
          }
        }
      }
    } catch (error) {
      errors.push({
        step: "stripe_subscription_cancellation",
        message: error instanceof Error ? error.message : "Unknown Stripe cleanup failure",
      });
    }
  }

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
    .map((row) => row.vault_secret_id)
    .filter((id): id is string => Boolean(id));

  for (const vaultId of vaultIds) {
    try {
      await vaultDelete(service, vaultId);
      vaultSecretsDeleted += 1;
    } catch (error) {
      errors.push({
        step: "vault_secret_deletion",
        message: error instanceof Error ? error.message : `Failed to delete Vault secret ${vaultId}`,
      });
    }
  }

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
          }
        );
        resendContactDeleted = true;
      }
    } catch (error) {
      errors.push({
        step: "resend_contact_deletion",
        message: error instanceof Error ? error.message : "Unknown Resend cleanup failure",
      });
    }
  }

  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) return apiError(error.message, 500);
  authUserDeleted = true;

  const { error: auditError } = await auditService.from("account_deletion_audit").insert({
    deleted_user_id: user.id,
    email_sha256: hashEmail(user.email),
    completed_at: new Date().toISOString(),
    status: errors.length > 0 ? "failed" : "completed",
    vault_secrets_seen: vaultIds.length,
    vault_secrets_deleted: vaultSecretsDeleted,
    stripe_customers_seen: stripeCustomersSeen,
    stripe_subscriptions_cancelled: stripeSubscriptionsCancelled,
    resend_contact_deleted: resendContactDeleted,
    auth_user_deleted: authUserDeleted,
    errors,
  });

  if (auditError) {
    serverLog({ level: "warn", event: "account.deletion.audit_write_failed", message: "Failed to write deletion audit log entry." });
  }

  return NextResponse.json({
    deleted: true,
    cleanup: {
      vault_secrets_deleted: vaultSecretsDeleted,
      stripe_subscriptions_cancelled: stripeSubscriptionsCancelled,
      resend_contact_deleted: resendContactDeleted,
      warnings: errors.length,
    },
  });
}
