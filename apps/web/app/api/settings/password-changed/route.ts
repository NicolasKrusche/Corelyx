import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { sendPasswordChangedEmail } from "@/lib/email";

export async function POST() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const changedAt = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  try {
    await sendPasswordChangedEmail({ to: user.email!, changedAt });
  } catch {
    // Best-effort — don't fail the response if email sending breaks
  }

  return NextResponse.json({ ok: true });
}
