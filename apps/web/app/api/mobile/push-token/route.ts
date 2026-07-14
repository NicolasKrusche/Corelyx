import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { authenticateMobileToken, mobileTokenFromRequest } from "@/lib/mobile-devices";

/**
 * POST /api/mobile/push-token — the app uploads (or refreshes) its Expo push
 * token. Authenticated by the phone's crlxmob_ device token so the token is
 * always written to the correct device row (never a client-supplied device id).
 * Idempotent: safe to call on every app launch.
 */
export async function POST(request: Request) {
  const token = mobileTokenFromRequest(request);
  const device = await authenticateMobileToken(token);
  if (!device) return apiError("Unauthorized", 401);

  const body = (await request.json().catch(() => null)) as { push_token?: unknown } | null;
  const pushToken = typeof body?.push_token === "string" ? body.push_token.trim() : "";
  if (!pushToken.startsWith("ExponentPushToken")) {
    return apiError("Invalid push token.", 400);
  }

  await (createServiceClient() as unknown as {
    from(t: string): {
      update(v: Record<string, unknown>): { eq(c: string, v: string): PromiseLike<unknown> };
    };
  })
    .from("devices")
    .update({
      push_token: pushToken,
      push_platform: device.platform,
      push_token_updated_at: new Date().toISOString(),
    })
    .eq("id", device.id);

  return NextResponse.json({ ok: true });
}
