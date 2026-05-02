import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SCOPES = ["task:add", "data:read", "data:read_write", "data:delete", "project:delete"].join(" ");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "todoist:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.TODOIST_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/todoist/callback`,
    scope: SCOPES,
    state: issuedState.state,
    response_type: "code",
  });

  const response = NextResponse.redirect(`https://todoist.com/oauth/authorize?${params.toString()}`);
  return applyOAuthStateCookie(response, issuedState);
}
