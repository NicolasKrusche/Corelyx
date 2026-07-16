import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/api";
import { sendPasswordResetEmail } from "@/lib/email";
import { enforcePublicEndpointRateLimit } from "@/lib/public-rate-limit";
import { serverLog } from "@/lib/server-log";

export async function POST(req: NextRequest) {
  const limited = await enforcePublicEndpointRateLimit(req, "reset-password", 5, 60_000);
  if (limited) return limited;

  try {
    const { email } = (await req.json()) as { email?: string };

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.corelyx.app";
    const resetRedirect = `${appUrl}/auth/callback?next=/update-password`;

    const supabase = createServiceClient();

    // Generate the recovery link via admin API — no Supabase SMTP involved
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: resetRedirect },
    });

    if (error) {
      // Log but always return ok to prevent email enumeration
      serverLog({ level: "error", event: "auth.reset_password.generate_link_failed", message: "generateLink returned an error; returning ok to prevent email enumeration." });
      return NextResponse.json({ ok: true });
    }

    const resetUrl = data.properties.action_link;

    // Send via Resend
    try {
      await sendPasswordResetEmail({ to: email, resetUrl });
    } catch (emailErr) {
      serverLog({ level: "error", event: "auth.reset_password.email_send_failed", message: "Password reset email could not be sent via Resend." });
      // Still return ok — user can contact support if needed
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    serverLog({ level: "error", event: "auth.reset_password.unexpected_error", message: "Unexpected error in reset-password handler." });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
