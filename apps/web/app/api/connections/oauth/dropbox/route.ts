import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SCOPES = ["files.content.read", "files.content.write", "files.metadata.read", "sharing.read", "account_info.read"].join(" ");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "dropbox:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.DROPBOX_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/dropbox/callback`,
    scope: SCOPES,
    state: issuedState.state,
    response_type: "code",
    token_access_type: "offline",
  });

  const response = NextResponse.redirect(`https://www.dropbox.com/oauth2/authorize?${params.toString()}`);
  return applyOAuthStateCookie(response, issuedState);
}
