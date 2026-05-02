import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const { searchParams, origin } = new URL(request.url);
  const label = searchParams.get("label") ?? "evernote:primary";
  // Evernote uses OAuth1 — redirect to API token entry instead
  return NextResponse.redirect(
    `${origin}/connections?connect_api_key=evernote&label=${encodeURIComponent(label)}`
  );
}
