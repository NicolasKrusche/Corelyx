import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/api";
import { sendDuplicateSignupEmail, sendWelcomeEmail } from "@/lib/email";
import { enforcePublicEndpointRateLimit } from "@/lib/public-rate-limit";
import { serverLog } from "@/lib/server-log";
import { isDisposableEmail } from "@/lib/disposable-emails";
import { verifyCaptchaToken } from "@/lib/captcha";

export async function POST(req: NextRequest) {
  const limited = await enforcePublicEndpointRateLimit(req, "signup", 10, 60_000);
  if (limited) return limited;

  try {
    const { email, password, captcha_token } = (await req.json()) as {
      email?: string;
      password?: string;
      captcha_token?: string;
    };

    // No-op unless TURNSTILE_SECRET_KEY is configured.
    const remoteIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    if (!(await verifyCaptchaToken(captcha_token, remoteIp))) {
      return NextResponse.json(
        { error: "CAPTCHA verification failed. Please try again." },
        { status: 400 }
      );
    }

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (isDisposableEmail(email)) {
      return NextResponse.json({ error: "Please use a permanent email address to sign up." }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Create the user with email pre-confirmed, bypassing Supabase's built-in mailer
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("duplicate")) {
        // Don't reveal that the email exists — send a notification email instead
        try {
          await sendDuplicateSignupEmail({ to: email });
        } catch {
          // best-effort
        }
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Stamp legal consent at signup (checkboxes are required on the form)
    if (data.user) {
      await supabase
        .from("profiles")
        .update({ legal_consented_at: new Date().toISOString(), legal_consent_version: "v1" } as never)
        .eq("id", data.user.id);
    }

    // Send a welcome email via Resend (best-effort — don't fail signup if this errors)
    try {
      await sendWelcomeEmail({ to: email });
    } catch (emailErr) {
      serverLog({ level: "warn", event: "auth.signup.welcome_email_failed", message: "Welcome email could not be sent; signup succeeded." });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    serverLog({ level: "error", event: "auth.signup.unexpected_error", message: "Unexpected error in signup handler." });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
