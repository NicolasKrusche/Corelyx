import { NextResponse } from "next/server";
import { createServiceClient, apiError } from "@/lib/api";
import { authenticateMobileToken, mobileTokenFromRequest } from "@/lib/mobile-devices";

/**
 * DELETE /api/mobile/devices/[id] — soft-revoke a mobile device: set revoked_at
 * and clear its push token so it can no longer authenticate, approve 2FA, or
 * receive pushes. Authenticated by any of the user's active mobile tokens; the
 * target device must belong to the same user.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const device = await authenticateMobileToken(mobileTokenFromRequest(request));
  if (!device) return apiError("Unauthorized", 401);

  const { id } = await params;

  const service = createServiceClient();
  const { data: target } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        eq(c: string, v: string): { maybeSingle(): Promise<{ data: { id: string; user_id: string } | null }> };
      };
    };
  })
    .from("devices")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!target || target.user_id !== device.user_id) {
    return apiError("Device not found.", 404);
  }

  await (service as unknown as {
    from(t: string): {
      update(v: Record<string, unknown>): { eq(c: string, v: string): PromiseLike<unknown> };
    };
  })
    .from("devices")
    .update({ revoked_at: new Date().toISOString(), push_token: null, is_default_2fa: false })
    .eq("id", id);

  return NextResponse.json({ revoked: true });
}
