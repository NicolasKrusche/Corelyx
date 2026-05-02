import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SCOPES = ["r_liteprofile", "r_emailaddress", "w_member_social", "r_organization_social", "w_organization_social"].join(" ");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "linkedin:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/linkedin/callback`,
    scope: SCOPES,
    state: issuedState.state,
    response_type: "code",
  });

  const response = NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
  return applyOAuthStateCookie(response, issuedState);
}
