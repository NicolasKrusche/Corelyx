import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const HUBSPOT_SCOPES = [
  "crm.objects.contacts.read", "crm.objects.contacts.write",
  "crm.objects.deals.read", "crm.objects.deals.write",
  "content",
].join(" ");

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label") ?? "hubspot:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label });

  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/hubspot/callback`,
    scope: HUBSPOT_SCOPES,
    state: issuedState.state,
  });

  const response = NextResponse.redirect(
    `https://app.hubspot.com/oauth/authorize?${params.toString()}`
  );
  return applyOAuthStateCookie(response, issuedState);
}
