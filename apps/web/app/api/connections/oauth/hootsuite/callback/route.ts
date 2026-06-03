import { createServiceClient } from "@/lib/api";
import { upsertOAuthConnection } from "@/lib/oauth-token";
import { peekOAuthStateFlowId, redirectWithClearedOAuthState, verifyOAuthStateFromRequest } from "@/lib/oauth-state";

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
  const label = typeof payload.label === "string" && payload.label.trim() ? payload.label : "hootsuite:primary";

  const credentials = Buffer.from(`${process.env.HOOTSUITE_CLIENT_ID!}:${process.env.HOOTSUITE_CLIENT_SECRET!}`).toString("base64");
  const tokenRes = await fetch("https://platform.hootsuite.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/hootsuite/callback`,
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
      provider: "hootsuite",
      label,
      tokens: { access_token: accessToken, refresh_token: tokens.refresh_token as string | undefined },
      scopes: typeof tokens.scope === "string" ? tokens.scope.split(/[\s,]+/) : [],
      metadata: {},
    });
  } catch {
    return redirectWithClearedOAuthState(`${origin}/connections?error=vault_failed`, flowId);
  }

  return redirectWithClearedOAuthState(`${origin}/connections?connected=hootsuite`, flowId);
}
