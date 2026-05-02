import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

// Basecamp uses "type=web_server" instead of "response_type=code" and does not require a scope param.

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "basecamp:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.BASECAMP_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/basecamp/callback`,
    state: issuedState.state,
    type: "web_server",
  });

  const response = NextResponse.redirect(`https://launchpad.37signals.com/authorization/new?${params.toString()}`);
  return applyOAuthStateCookie(response, issuedState);
}
