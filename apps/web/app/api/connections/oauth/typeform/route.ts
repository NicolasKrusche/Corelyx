import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const TYPEFORM_SCOPES = ["responses:read", "forms:read"].join("+");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "typeform:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.TYPEFORM_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/typeform/callback`,
    response_type: "code",
    scope: TYPEFORM_SCOPES,
    state: issuedState.state,
  });

  const response = NextResponse.redirect(
    `https://api.typeform.com/oauth/authorize?${params.toString()}`
  );
  return applyOAuthStateCookie(response, issuedState);
}
