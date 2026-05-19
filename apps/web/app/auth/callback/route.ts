import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ensureUserProvisioned } from "@/lib/auth/provisioning";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Only allow relative paths that start with a single slash and contain no protocol
  const next = /^\/[^/]/.test(rawNext) && !rawNext.includes("://") ? rawNext : "/dashboard";

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        try {
          await ensureUserProvisioned(user);
        } catch {
          return NextResponse.redirect(`${origin}/login?error=account_setup_failed`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
