import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { sendSecurityAlertEmail } from "@/lib/email";
import { cookieMaxAgeSeconds, issueCookieValue, TWO_FACTOR_COOKIE } from "@/lib/auth/two-factor";

// GET /api/settings/two-factor — current email-2FA state for the settings UI.
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("email_2fa_enabled")
    .eq("id", user.id)
    .single<{ email_2fa_enabled: boolean | null }>();
  return NextResponse.json({ enabled: Boolean(data?.email_2fa_enabled) });
}

// POST /api/settings/two-factor { enabled: boolean } — toggle email 2FA.
// Enabling also marks the current browser as verified so the user is not
// locked out of the session they just used to turn it on.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return apiError("enabled must be a boolean.", 400);
  const enabled = body.enabled;

  if (enabled && !user.email) {
    return apiError("Email two-factor authentication needs an email address on the account.", 400);
  }

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ email_2fa_enabled: enabled } as never)
    .eq("id", user.id);
  if (error) return apiError(error.message, 500);

  // Security notification on every toggle — especially disabling, which is
  // the action a hijacked session would take.
  if (user.email) {
    void sendSecurityAlertEmail({
      to: user.email,
      subject: enabled
        ? "Two-factor authentication enabled"
        : "Two-factor authentication disabled",
      summary: enabled
        ? "Email sign-in codes are now required for your Corelyx account."
        : "Email sign-in codes were turned OFF for your Corelyx account.",
      items: [
        {
          title: "Wasn't you?",
          body: enabled
            ? "Change your password immediately."
            : "Change your password immediately and re-enable two-factor authentication.",
        },
      ],
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ enabled });
  if (enabled) {
    response.cookies.set(TWO_FACTOR_COOKIE, issueCookieValue(user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: cookieMaxAgeSeconds(),
    });
  } else {
    response.cookies.delete(TWO_FACTOR_COOKIE);
  }
  return response;
}
