import { NextResponse } from "next/server";
import { createServiceClient, apiError } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/mobile/revoke-all — soft-revoke ALL of the current user's mobile
 * devices and clear their push tokens. Called by the web app's "sign out
 * everywhere" so that global sign-out also cuts off every phone's ability to
 * authenticate, approve 2FA, or receive pushes (Supabase signOut({scope:'global'})
 * alone only revokes refresh tokens, not these device credentials).
 *
 * Authenticated by the browser's Supabase cookie session.
 */
export async function POST() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  await (createServiceClient() as unknown as {
    from(t: string): {
      update(v: Record<string, unknown>): {
        eq(c: string, v: string): {
          in(c: string, v: string[]): { is(c: string, v: null): PromiseLike<unknown> };
        };
      };
    };
  })
    .from("devices")
    .update({ revoked_at: new Date().toISOString(), push_token: null, is_default_2fa: false })
    .eq("user_id", user.id)
    .in("platform", ["ios", "android"])
    .is("revoked_at", null);

  return NextResponse.json({ ok: true });
}
