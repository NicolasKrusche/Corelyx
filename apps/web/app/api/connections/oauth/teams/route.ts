import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SCOPES = [
  "https://graph.microsoft.com/Channel.ReadBasic.All",
  "https://graph.microsoft.com/ChannelMessage.Send",
  "https://graph.microsoft.com/Chat.ReadWrite",
  "https://graph.microsoft.com/Team.ReadBasic.All",
  "offline_access",
].join(" ");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "teams:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/teams/callback`,
    scope: SCOPES,
    state: issuedState.state,
    response_type: "code",
  });
  const response = NextResponse.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
  return applyOAuthStateCookie(response, issuedState);
}
