import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/api";
import { sendPasswordResetEmail } from "@/lib/email";
import { enforcePublicEndpointRateLimit } from "@/lib/public-rate-limit";

export async function POST(req: NextRequest) {
  const limited = await enforcePublicEndpointRateLimit(req, "reset-password", 5, 60_000);
  if (limited) return limited;

  try {
    const { email } = (await req.json()) as { email?: string };

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.corelyx.app";
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
      console.error("[auth/reset-password] generateLink error:", error.message);
      return NextResponse.json({ ok: true });
    }

    const resetUrl = data.properties.action_link;

    // Send via Resend
    try {
      await sendPasswordResetEmail({ to: email, resetUrl });
    } catch (emailErr) {
      console.error("[auth/reset-password] Resend error:", emailErr);
      // Still return ok — user can contact support if needed
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/reset-password] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
