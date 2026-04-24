import { createServiceClient } from "@/lib/api";
import { upsertOAuthConnection } from "@/lib/oauth-token";
import {
  peekOAuthStateFlowId,
  redirectWithClearedOAuthState,
  verifyOAuthStateFromRequest,
} from "@/lib/oauth-state";

const AIRTABLE_CALLBACK_PATH = "/api/connections/oauth/airtable/callback";

function getAirtableCallbackUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  return `${appUrl.replace(/\/$/, "")}${AIRTABLE_CALLBACK_PATH}`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");
  const stateFlowId = peekOAuthStateFlowId(state);

  if (errorParam) {
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=${errorParam}`,
      stateFlowId
    );
  }
  if (!code || !state) {
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=missing_params`,
      stateFlowId
    );
  }

  const verifiedState = await verifyOAuthStateFromRequest(state);
  if (!verifiedState.ok) {
    const errorCode =
      verifiedState.reason === "session_missing"
        ? "session_required"
        : "invalid_state";
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=${errorCode}`,
      verifiedState.flowId ?? stateFlowId
    );
  }

  const { flowId, userId, payload } = verifiedState.value;
  const label =
    typeof payload.label === "string" && payload.label.trim()
      ? payload.label
      : "airtable:primary";
  const codeVerifier =
    typeof payload.codeVerifier === "string" ? payload.codeVerifier : null;
  if (!codeVerifier) {
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=invalid_state`,
      flowId
    );
  }
  const clientId = process.env.AIRTABLE_CLIENT_ID;
  const clientSecret = process.env.AIRTABLE_CLIENT_SECRET;
  const redirectUri = getAirtableCallbackUrl();

  if (!clientId || !clientSecret || !redirectUri) {
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=missing_airtable_oauth_config`,
      flowId
    );
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

  if (!tokenRes.ok) {
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=token_exchange_failed`,
      flowId
    );
  }

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
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=vault_failed`,
      flowId
    );
  }

  return redirectWithClearedOAuthState(
    `${origin}/connections?connected=airtable`,
    flowId
  );
}
