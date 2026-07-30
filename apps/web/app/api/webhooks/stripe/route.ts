import { NextResponse } from "next/server";
import { createServiceClient, type LooseServiceClient } from "@/lib/api";
import {
  epochToIso,
  invoiceSubscriptionId,
  subscriptionPeriod,
} from "@/lib/stripe-payload-shapes";

/**
 * POST /api/webhooks/stripe — Handle Stripe webhook events.
 *
 * Events handled:
 *   - checkout.session.completed: activate subscription
 *   - invoice.paid: record payment, extend period
 *   - customer.subscription.updated: sync plan/status changes
 *   - customer.subscription.deleted: mark subscription canceled
 *
 * Verifies Stripe signature using STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    console.error("Stripe webhook: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  let event;
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const service = createServiceClient() as LooseServiceClient;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orgId = session.metadata?.org_id;
        const planId = session.metadata?.plan_id;
        const billingMode = session.metadata?.billing_mode || "managed";

        if (!orgId || !planId) {
          console.warn("checkout.session.completed missing metadata:", session.id);
          break;
        }

        // Update subscription with Stripe details
        await service
          .from("org_subscriptions")
          .update({
            stripe_subscription_id: session.subscription as string,
            stripe_customer_id: session.customer as string,
            billing_mode: billingMode,
            status: "active",
            updated_at: new Date().toISOString(),
          } as never)
          .eq("org_id", orgId)
          .eq("plan_id", planId);

        console.log(`[stripe-webhook] checkout.session.completed: org=${orgId} plan=${planId}`);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const subscriptionId = invoiceSubscriptionId(invoice);

        if (!subscriptionId) {
          // One-off invoices legitimately have no subscription. Log it anyway:
          // this is also the branch a future API-shape change lands in, and it
          // used to swallow every renewal without a trace.
          console.log(
            `[stripe-webhook] invoice.paid: no subscription on invoice ${invoice.id} (parent.type=${invoice.parent?.type ?? "none"}) — skipping`
          );
          break;
        }

        // Find org by Stripe subscription ID
        const { data: sub } = await service
          .from("org_subscriptions")
          .select("id, org_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (!sub) break;

        // Extend the billing period. Routed through epochToIso so a malformed
        // timestamp yields null rather than throwing RangeError out of the
        // handler — a throw here becomes a 500, which Stripe retries for days.
        const periodStart = epochToIso(invoice.period_start);
        const periodEnd = epochToIso(invoice.period_end);

        await service
          .from("org_subscriptions")
          .update({
            status: "active",
            // Only overwrite the stored window when we actually resolved one;
            // a null would clear a period that is still valid.
            ...(periodStart ? { current_period_start: periodStart } : {}),
            ...(periodEnd ? { current_period_end: periodEnd } : {}),
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", sub.id);

        console.log(`[stripe-webhook] invoice.paid: sub=${sub.id} period_end=${periodEnd ?? "unchanged"}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const stripeSubId = subscription.id;

        // Map Stripe status to our status
        const statusMap: Record<string, string> = {
          active: "active",
          trialing: "trialing",
          past_due: "past_due",
          canceled: "canceled",
          unpaid: "past_due",
          paused: "paused",
        };

        const newStatus = statusMap[subscription.status] ?? "active";
        const period = subscriptionPeriod(subscription);

        await service
          .from("org_subscriptions")
          .update({
            status: newStatus,
            seats_count: subscription.items?.data?.[0]?.quantity ?? 1,
            // Omitted rather than nulled when unresolvable: the status change is
            // the point of this event, and it should still land even if the
            // period window cannot be read.
            ...(period.start ? { current_period_start: period.start } : {}),
            ...(period.end ? { current_period_end: period.end } : {}),
            updated_at: new Date().toISOString(),
          } as never)
          .eq("stripe_subscription_id", stripeSubId);

        console.log(
          `[stripe-webhook] customer.subscription.updated: ${stripeSubId} → ${newStatus} (period_end=${period.end ?? "unresolved"})`
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const stripeSubId = subscription.id;

        // Find the subscription and downgrade to free
        const { data: sub } = await service
          .from("org_subscriptions")
          .select("id, org_id")
          .eq("stripe_subscription_id", stripeSubId)
          .maybeSingle();

        if (!sub) break;

        // Get free plan
        const { data: freePlan } = await service
          .from("billing_plans")
          .select("id")
          .eq("slug", "free")
          .eq("is_active", true)
          .maybeSingle();

        if (freePlan) {
          await service
            .from("org_subscriptions")
            .update({
              plan_id: freePlan.id,
              status: "canceled",
              stripe_subscription_id: null,
              billing_mode: "managed",
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", sub.id);
        } else {
          await service
            .from("org_subscriptions")
            .update({
              status: "canceled",
              stripe_subscription_id: null,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", sub.id);
        }

        console.log(`[stripe-webhook] customer.subscription.deleted: ${stripeSubId}`);
        break;
      }

      default:
        console.log(`[stripe-webhook] unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] error processing ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
