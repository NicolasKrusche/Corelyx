import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import crypto from "crypto";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const AIRTABLE_SCOPES = [
  "data.records:read", "data.records:write",
  "schema.bases:read",
].join(" ");

const AIRTABLE_CALLBACK_PATH = "/api/connections/oauth/airtable/callback";

function getAirtableCallbackUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  return `${appUrl.replace(/\/$/, "")}${AIRTABLE_CALLBACK_PATH}`;
}

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label")?.trim() || "airtable:primary";
  const clientId = process.env.AIRTABLE_CLIENT_ID;
  const clientSecret = process.env.AIRTABLE_CLIENT_SECRET;
  const redirectUri = getAirtableCallbackUrl();

  if (!clientId || !clientSecret || !redirectUri) {
    return apiError("Missing Airtable OAuth configuration", 500);
  }

  // Airtable requires PKCE
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const issuedState = await issueOAuthStateForRequest(user.id, { label, codeVerifier });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: AIRTABLE_SCOPES,
    state: issuedState.state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const response = NextResponse.redirect(
    `https://airtable.com/oauth2/v1/authorize?${params.toString()}`
  );
  return applyOAuthStateCookie(response, issuedState);
}
