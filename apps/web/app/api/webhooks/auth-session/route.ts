import { NextResponse } from "next/server";
import { invalidateCacheForRevokedSession } from "@/lib/auth/cache";
import { requestHasValidInternalServiceToken } from "@/lib/internal-auth";
import { apiError } from "@/lib/api";

/**
 * POST /api/webhooks/auth-session
 *
 * Supabase Auth Webhook: auth.session.revoked
 * Called when a user's session is revoked (sign out everywhere, password change, admin revoke).
 * Invalidates our auth cache so subsequent requests re-fetch from Supabase.
 *
 * Secured by internal service token (audience: next:webhook:auth-session).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  // Verify internal service token
  if (
    !requestHasValidInternalServiceToken(request.headers, "next:webhook:auth-session", {
      method: "POST",
      path: new URL(request.url).pathname,
      body: rawBody,
    })
  ) {
    return apiError("Unauthorized", 401);
  }

  let payload: {
    type: string;
    record: { user_id: string; session_id?: string };
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return apiError("Invalid JSON", 400);
  }

  // Only handle session revoked events
  if (payload.type !== "auth.session.revoked") {
    return NextResponse.json({ ok: true, ignored: true, type: payload.type });
  }

  const userId = payload.record?.user_id;
  if (!userId) {
    return apiError("Missing user_id in webhook payload", 400);
  }

  try {
    await invalidateCacheForRevokedSession(userId);
    return NextResponse.json({ ok: true, invalidated: userId });
  } catch (error) {
    console.error("[auth-session-webhook] Cache invalidation failed:", error);
    return apiError("Cache invalidation failed", 500);
  }
}