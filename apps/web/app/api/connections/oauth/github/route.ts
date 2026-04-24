import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const GITHUB_SCOPES = ["repo", "read:user", "user:email"].join(" ");

function getCallbackUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  return `${appUrl.replace(/\/$/, "")}/api/connections/oauth/github/callback`;
}

export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = getCallbackUrl();

  if (!clientId || !redirectUri) {
    return apiError("Missing GitHub OAuth configuration", 500);
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "github:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GITHUB_SCOPES,
    state: issuedState.state,
  });

  const response = NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  );
  return applyOAuthStateCookie(response, issuedState);
}
