import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/api";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Create the user with email pre-confirmed, bypassing Supabase's built-in mailer
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      // Surface a friendly message for duplicate emails
      const msg = error.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("duplicate")) {
        return NextResponse.json(
          { error: "An account with this email already exists. Try signing in instead." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Send a welcome email via Resend (best-effort — don't fail signup if this errors)
    try {
      await sendWelcomeEmail({ to: email });
    } catch (emailErr) {
      console.warn("[auth/signup] Welcome email failed:", emailErr);
    }

    return NextResponse.json({ ok: true, user_id: data.user.id });
  } catch (err) {
    console.error("[auth/signup] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
