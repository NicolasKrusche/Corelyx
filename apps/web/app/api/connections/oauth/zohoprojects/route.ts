import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SCOPES = ["ZohoProjects.tasks.ALL", "ZohoProjects.milestones.ALL", "ZohoProjects.projects.ALL", "ZohoProjects.bugs.ALL", "offline_access"].join(" ");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "zohoprojects:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });
  const params = new URLSearchParams({ client_id: process.env.ZOHO_CLIENT_ID!, redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/zohoprojects/callback`, scope: SCOPES, state: issuedState.state, response_type: "code", access_type: "offline" });
  const response = NextResponse.redirect(`https://accounts.zoho.com/oauth/v2/auth?${params}`);
  return applyOAuthStateCookie(response, issuedState);
}
