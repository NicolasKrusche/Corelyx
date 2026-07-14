import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { authenticateMobileToken, mobileTokenFromRequest } from "@/lib/mobile-devices";

type Row = {
  id: string;
  requester_label: string | null;
  requester_ip: string | null;
  expires_at: string;
};

/**
 * GET /api/mobile/pending-2fa — the newest pending, unexpired push login
 * challenge for the current user (or null). Lets the Guard tab surface a
 * sign-in request even when the push notification didn't arrive (e.g. Expo Go).
 * Authenticated by the phone's crlxmob_ device token.
 */
export async function GET(request: Request) {
  const device = await authenticateMobileToken(mobileTokenFromRequest(request));
  if (!device) return apiError("Unauthorized", 401);

  const query = (createServiceClient() as unknown as {
    from(t: string): { select(c: string): any };
  })
    .from("two_factor_challenges")
    .select("id, requester_label, requester_ip, expires_at")
    .eq("user_id", device.user_id)
    .eq("channel", "push")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  const { data } = (await query) as { data: Row[] | null };
  return NextResponse.json({ challenge: data?.[0] ?? null });
}
