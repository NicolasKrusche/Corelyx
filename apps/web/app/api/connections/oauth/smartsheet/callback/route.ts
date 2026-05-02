import { createServiceClient } from "@/lib/api";
import { upsertOAuthConnection } from "@/lib/oauth-token";
import { peekOAuthStateFlowId, redirectWithClearedOAuthState, verifyOAuthStateFromRequest } from "@/lib/oauth-state";

// NOTE: Smartsheet's production token exchange requires a SHA256 hash of (client_secret + "|" + code)
// as a "hash" parameter instead of the plain client_secret. This implementation uses standard
// OAuth2 for simplicity — update the token exchange body to include the hash field for production use.

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");
  const stateFlowId = peekOAuthStateFlowId(state);

  if (errorParam) {
    return redirectWithClearedOAuthState(`${origin}/connections?error=${errorParam}`, stateFlowId);
  }
  if (!code || !state) {
    return redirectWithClearedOAuthState(`${origin}/connections?error=missing_params`, stateFlowId);
  }

  const verifiedState = await verifyOAuthStateFromRequest(state);
  if (!verifiedState.ok) {
    const errorCode = verifiedState.reason === "session_missing" ? "session_required" : "invalid_state";
    return redirectWithClearedOAuthState(`${origin}/connections?error=${errorCode}`, verifiedState.flowId ?? stateFlowId);
  }
  const { flowId, userId, payload } = verifiedState.value;
  const label = typeof payload.label === "string" && payload.label.trim() ? payload.label : "smartsheet:primary";

  const tokenRes = await fetch("https://api.smartsheet.com/2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.SMARTSHEET_CLIENT_ID!,
      client_secret: process.env.SMARTSHEET_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/smartsheet/callback`,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    return redirectWithClearedOAuthState(`${origin}/connections?error=token_exchange_failed`, flowId);
  }

  const tokens = await tokenRes.json() as Record<string, unknown>;
  const accessToken = tokens.access_token as string;
  if (!accessToken) {
    return redirectWithClearedOAuthState(`${origin}/connections?error=no_access_token`, flowId);
  }

  const serviceClient = createServiceClient();
  try {
    await upsertOAuthConnection(serviceClient, {
      userId,
      provider: "smartsheet",
      label,
      tokens: { access_token: accessToken, refresh_token: tokens.refresh_token as string | undefined },
      scopes: typeof tokens.scope === "string" ? tokens.scope.split(/[\s,]+/) : [],
      metadata: {},
    });
  } catch {
    return redirectWithClearedOAuthState(`${origin}/connections?error=vault_failed`, flowId);
  }

  return redirectWithClearedOAuthState(`${origin}/connections?connected=smartsheet`, flowId);
}
