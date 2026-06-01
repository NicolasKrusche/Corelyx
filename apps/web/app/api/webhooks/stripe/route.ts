import { NextResponse } from "next/server";

/**
 * DEPRECATED — all Stripe webhook logic has been consolidated into
 * /api/billing/webhook. This stub returns 200 so any existing Stripe
 * dashboard registrations don't start failing with 404s while you
 * remove the endpoint from the Stripe dashboard.
 *
 * ACTION REQUIRED: remove /api/webhooks/stripe from your Stripe
 * dashboard webhook endpoints, then delete this file.
 */
export async function POST() {
  return NextResponse.json({ received: true, deprecated: true });
}
