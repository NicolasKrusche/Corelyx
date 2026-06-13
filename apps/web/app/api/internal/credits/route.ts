import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getValidInternalServiceClaims } from "@/lib/internal-auth";
import { getUserCreditBalance, deductUserCredits } from "@/lib/credits";
import { maybeFireAutoRecharge } from "@/lib/auto-recharge";

// GET /api/internal/credits
// Called by the Python runtime to check credit balance before an LLM call.
// Header: x-internal-service-token with subject = user_id
// Returns: { availableIncluded: number, availablePurchased: number, total: number }
export async function GET(request: Request) {
  const claims = getValidInternalServiceClaims(request.headers, "next:credits", {
    method: "GET",
    path: new URL(request.url).pathname,
  });
  if (!claims?.sub) return apiError("Unauthorized", 401);

  try {
    const balance = await getUserCreditBalance(claims.sub);
    return NextResponse.json({
      availableIncluded: balance.availableIncluded === Infinity ? null : balance.availableIncluded,
      availablePurchased: balance.availablePurchased,
      total: balance.total === Infinity ? null : balance.total,
    });
  } catch {
    return apiError("Failed to fetch credit balance", 500);
  }
}

// POST /api/internal/credits
// Body: { amount_credits: number }
// Deducts credits. Returns { ok: true } or 402 if insufficient balance.
export async function POST(request: Request) {
  // Read the raw body first so the internal token can be bound to it — this
  // prevents a captured token from being replayed with a different/duplicated
  // amount_credits within its lifetime (mirrors runs/[id]/complete).
  const rawBody = await request.text();
  const claims = getValidInternalServiceClaims(request.headers, "next:credits", {
    method: "POST",
    path: new URL(request.url).pathname,
    body: rawBody,
  });
  if (!claims?.sub) return apiError("Unauthorized", 401);

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const amount = (body as Record<string, unknown>)?.amount_credits;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
    return apiError("amount_credits must be a positive integer", 400);
  }

  try {
    const ok = await deductUserCredits(claims.sub, amount);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
    }
    // Fire-and-forget: check if auto-recharge should trigger
    void maybeFireAutoRecharge(claims.sub).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch {
    return apiError("Failed to deduct credits", 500);
  }
}
