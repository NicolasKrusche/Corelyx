import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SCOPES = ["read:confluence-content.all", "write:confluence-content", "read:confluence-user", "offline_access"].join(" ");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "confluence:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.ATLASSIAN_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/confluence/callback`,
    scope: SCOPES,
    state: issuedState.state,
    response_type: "code",
    audience: "api.atlassian.com",
    prompt: "consent",
  });

  const response = NextResponse.redirect(`https://auth.atlassian.com/authorize?${params.toString()}`);
  return applyOAuthStateCookie(response, issuedState);
}
