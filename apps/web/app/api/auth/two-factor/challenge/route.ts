import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { sendTwoFactorCodeEmail } from "@/lib/email";
import { CODE_TTL_MINUTES, generateCode, hashCode } from "@/lib/auth/two-factor";

// POST /api/auth/two-factor/challenge — email a fresh 6-digit code to the
// signed-in user. Called by the /verify-2fa page on load and on "resend".
export async function POST() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!user.email) return apiError("No email on record for this account.", 400);

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("email_2fa_enabled")
    .eq("id", user.id)
    .single<{ email_2fa_enabled: boolean }>();
  if (!profile?.email_2fa_enabled) {
    return apiError("Two-factor authentication is not enabled.", 400);
  }

  // Each challenge sends an email; cap per-user volume.
  if (!(await rateLimit(`2fa-challenge:${user.id}`, 5, 60 * 60 * 1000))) {
    return apiError("Too many codes requested. Please wait before trying again.", 429);
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  // Invalidate older outstanding challenges so only the newest code counts.
  await (service as unknown as {
    from(t: string): {
      update(v: Record<string, unknown>): {
        eq(c: string, v: string): { is(c: string, v: null): PromiseLike<unknown> };
      };
    };
  })
    .from("two_factor_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("consumed_at", null);

  const { error } = await (service as unknown as {
    from(t: string): { insert(v: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }> };
  })
    .from("two_factor_challenges")
    .insert({ user_id: user.id, code_hash: hashCode(code, user.id), expires_at: expiresAt });
  if (error) return apiError("Could not create a verification code.", 500);

  try {
    await sendTwoFactorCodeEmail({ to: user.email, code });
  } catch {
    return apiError("Could not send the verification email. Try again shortly.", 502);
  }

  return NextResponse.json({ sent: true, expires_at: expiresAt });
}
