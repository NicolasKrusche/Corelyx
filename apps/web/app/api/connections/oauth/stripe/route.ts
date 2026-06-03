import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";
import { checkPayPerUseConnectorAccess } from "@/lib/limits";

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const access = await checkPayPerUseConnectorAccess(user.id);
  if (!access.allowed) return apiError(access.upgradeMessage ?? access.reason ?? "Solo plan required", 403);
  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "stripe:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });
  const params = new URLSearchParams({ client_id: process.env.STRIPE_CLIENT_ID!, redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/stripe/callback`, scope: "read_write", state: issuedState.state, response_type: "code" });
  const response = NextResponse.redirect(`https://connect.stripe.com/oauth/authorize?${params}`);
  return applyOAuthStateCookie(response, issuedState);
}
