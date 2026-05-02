import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SCOPES = [
  "design:content:read",
  "design:content:write",
  "design:meta:read",
  "profile:read",
  "asset:read",
  "asset:write",
  "comment:read",
  "comment:write",
  "folder:read",
  "folder:write",
].join(" ");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "canva:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.CANVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/canva/callback`,
    scope: SCOPES,
    state: issuedState.state,
    response_type: "code",
  });

  const response = NextResponse.redirect(`https://www.canva.com/api/oauth/authorize?${params.toString()}`);
  return applyOAuthStateCookie(response, issuedState);
}
