import { NextResponse } from "next/server";
import { createServiceClient, apiError } from "@/lib/api";
import { authenticateMobileToken, mobileTokenFromRequest } from "@/lib/mobile-devices";

type Row = {
  id: string;
  name: string;
  platform: string;
  is_default_2fa: boolean;
  last_seen_at: string | null;
  created_at: string;
};

/**
 * GET /api/mobile/devices — list the current user's registered mobile devices
 * (never returns token hashes / push tokens). Authenticated by the phone's
 * crlxmob_ device token. Lets the app show "your devices" and which one is the
 * 2FA default.
 */
export async function GET(request: Request) {
  const device = await authenticateMobileToken(mobileTokenFromRequest(request));
  if (!device) return apiError("Unauthorized", 401);

  const { data } = await (createServiceClient() as unknown as {
    from(t: string): {
      select(c: string): {
        eq(c: string, v: string): {
          in(c: string, v: string[]): {
            is(c: string, v: null): {
              order(c: string, o: { ascending: boolean }): Promise<{ data: Row[] | null }>;
            };
          };
        };
      };
    };
  })
    .from("devices")
    .select("id, name, platform, is_default_2fa, last_seen_at, created_at")
    .eq("user_id", device.user_id)
    .in("platform", ["ios", "android"])
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  return NextResponse.json({ devices: (data ?? []).map((d) => ({ ...d, current: d.id === device.id })) });
}
