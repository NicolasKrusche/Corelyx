import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/api";
import { upsertOAuthConnection } from "@/lib/oauth-token";

type AirtableOAuthState = {
  userId?: unknown;
  label?: unknown;
  codeVerifier?: unknown;
};

const AIRTABLE_CALLBACK_PATH = "/api/connections/oauth/airtable/callback";

function getAirtableCallbackUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  return `${appUrl.replace(/\/$/, "")}${AIRTABLE_CALLBACK_PATH}`;
}

function decodeAirtableOAuthState(state: string) {
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as AirtableOAuthState;
    if (typeof decoded.userId !== "string" || typeof decoded.codeVerifier !== "string") {
      return null;
    }

    return {
      userId: decoded.userId,
      label: typeof decoded.label === "string" && decoded.label.trim() ? decoded.label : "airtable:primary",
      codeVerifier: decoded.codeVerifier,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) return NextResponse.redirect(`${origin}/connections?error=${errorParam}`);
  if (!code || !state) return NextResponse.redirect(`${origin}/connections?error=missing_params`);

  const decodedState = decodeAirtableOAuthState(state);
  if (!decodedState) {
    return NextResponse.redirect(`${origin}/connections?error=invalid_state`);
  }

  const { userId, label, codeVerifier } = decodedState;
  const clientId = process.env.AIRTABLE_CLIENT_ID;
  const clientSecret = process.env.AIRTABLE_CLIENT_SECRET;
  const redirectUri = getAirtableCallbackUrl();

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(`${origin}/connections?error=missing_airtable_oauth_config`);
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://airtable.com/oauth2/v1/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) return NextResponse.redirect(`${origin}/connections?error=token_exchange_failed`);

  const tokens = await tokenRes.json();

  const serviceClient = createServiceClient();
  try {
    await upsertOAuthConnection(serviceClient, {
      userId,
      provider: "airtable",
      label,
      tokens,
      scopes: ["data.records:read", "data.records:write", "schema.bases:read"],
      metadata: {},
    });
  } catch {
    return NextResponse.redirect(`${origin}/connections?error=vault_failed`);
  }

  return NextResponse.redirect(`${origin}/connections?connected=airtable`);
}
