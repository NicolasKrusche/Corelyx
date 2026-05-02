import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SCOPES = ["identity", "read", "submit", "subscribe"].join(" ");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "reddit:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.REDDIT_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/reddit/callback`,
    scope: SCOPES,
    state: issuedState.state,
    response_type: "code",
    duration: "permanent",
  });

  const response = NextResponse.redirect(`https://www.reddit.com/api/v1/authorize?${params.toString()}`);
  return applyOAuthStateCookie(response, issuedState);
}
