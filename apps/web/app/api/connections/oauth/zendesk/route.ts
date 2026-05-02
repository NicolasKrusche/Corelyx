import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const { searchParams, origin } = new URL(request.url);
  const subdomain = searchParams.get("subdomain");
  if (!subdomain) return NextResponse.redirect(`${origin}/connections?error=missing_subdomain_param`);
  const label = searchParams.get("label") ?? "zendesk:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label, subdomain });
  const params = new URLSearchParams({ client_id: process.env.ZENDESK_CLIENT_ID!, redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/zendesk/callback`, scope: "read write", state: issuedState.state, response_type: "code" });
  const response = NextResponse.redirect(`https://${subdomain}.zendesk.com/oauth/authorizations/new?${params}`);
  return applyOAuthStateCookie(response, issuedState);
}
