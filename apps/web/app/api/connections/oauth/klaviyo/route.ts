import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SCOPES = [
  "campaigns:read",
  "campaigns:write",
  "lists:read",
  "lists:write",
  "metrics:read",
  "profiles:read",
  "profiles:write",
  "segments:read",
  "events:write",
  "flows:read",
  "flows:write",
].join(" ");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "klaviyo:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.KLAVIYO_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/klaviyo/callback`,
    scope: SCOPES,
    state: issuedState.state,
    response_type: "code",
  });

  const response = NextResponse.redirect(`https://www.klaviyo.com/oauth/authorize?${params.toString()}`);
  return applyOAuthStateCookie(response, issuedState);
}
