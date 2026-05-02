import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "box:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });
  const params = new URLSearchParams({ client_id: process.env.BOX_CLIENT_ID!, redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/box/callback`, state: issuedState.state, response_type: "code" });
  const response = NextResponse.redirect(`https://account.box.com/api/oauth2/authorize?${params}`);
  return applyOAuthStateCookie(response, issuedState);
}
