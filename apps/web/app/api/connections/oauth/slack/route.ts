import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SLACK_SCOPES = [
  "channels:read", "channels:history",
  "chat:write", "chat:write.public",
  "users:read", "files:read", "app_mentions:read",
].join(",");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "slack:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/slack/callback`,
    scope: SLACK_SCOPES,
    state: issuedState.state,
  });

  const response = NextResponse.redirect(
    `https://slack.com/oauth/v2/authorize?${params.toString()}`
  );
  return applyOAuthStateCookie(response, issuedState);
}
