import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

// Trello uses a simplified token-based flow rather than standard OAuth2 code exchange.
// The token is returned directly via redirect after the user approves.

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "trello:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/trello/callback`;

  const params = new URLSearchParams({
    response_type: "token",
    key: process.env.TRELLO_API_KEY!,
    callback_method: "query",
    redirect_uri: redirectUri,
    scope: "read,write,account",
    expiration: "never",
    name: "FlowOS",
    state: issuedState.state,
  });

  const response = NextResponse.redirect(`https://trello.com/1/authorize?${params.toString()}`);
  return applyOAuthStateCookie(response, issuedState);
}
