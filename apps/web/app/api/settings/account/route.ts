import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { getStripeClient } from "@/lib/stripe";

const CANCELABLE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

// DELETE /api/settings/account — permanently deletes the authenticated user's account.
// Cancels any active Stripe subscriptions before removing the auth user.
export async function DELETE() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  // Cancel Stripe subscriptions — non-fatal so account deletion still proceeds on error.
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
      // Stripe cleanup failure is logged server-side but must not block account deletion.
    }
  }

  const service = createServiceClient();

  // Delete auth user — cascades to profiles, programs, runs, connections, api_keys via ON DELETE CASCADE
  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) return apiError(error.message, 500);

  return NextResponse.json({ deleted: true });
}
