import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

// ClickUp does not use a scope param in the authorize URL.
// The authorize endpoint is https://app.clickup.com/api with client_id, redirect_uri, and state.

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "clickup:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/clickup/callback`;

  const params = new URLSearchParams({
    client_id: process.env.CLICKUP_CLIENT_ID!,
    redirect_uri: redirectUri,
    state: issuedState.state,
  });

  const response = NextResponse.redirect(`https://app.clickup.com/api?${params.toString()}`);
  return applyOAuthStateCookie(response, issuedState);
}
