import { createServiceClient } from "@/lib/api";
import { upsertOAuthConnection } from "@/lib/oauth-token";
import { peekOAuthStateFlowId, redirectWithClearedOAuthState, verifyOAuthStateFromRequest } from "@/lib/oauth-state";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code"); const state = searchParams.get("state"); const errorParam = searchParams.get("error");
  const stateFlowId = peekOAuthStateFlowId(state);
  if (errorParam) return redirectWithClearedOAuthState(`${origin}/connections?error=${errorParam}`, stateFlowId);
  if (!code || !state) return redirectWithClearedOAuthState(`${origin}/connections?error=missing_params`, stateFlowId);
  const verifiedState = await verifyOAuthStateFromRequest(state);
  if (!verifiedState.ok) return redirectWithClearedOAuthState(`${origin}/connections?error=invalid_state`, verifiedState.flowId ?? stateFlowId);
  const { flowId, userId, payload } = verifiedState.value;
  const label = typeof payload.label === "string" && payload.label.trim() ? payload.label : "zendesk:primary";
  const subdomain = typeof payload.subdomain === "string" ? payload.subdomain : "";
  if (!subdomain) return redirectWithClearedOAuthState(`${origin}/connections?error=missing_subdomain`, flowId);
  const tokenRes = await fetch(`https://${subdomain}.zendesk.com/oauth/tokens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", code, client_id: process.env.ZENDESK_CLIENT_ID, client_secret: process.env.ZENDESK_CLIENT_SECRET, redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/zendesk/callback`, scope: "read write" }), cache: "no-store" });
  if (!tokenRes.ok) return redirectWithClearedOAuthState(`${origin}/connections?error=token_exchange_failed`, flowId);
  const tokens = await tokenRes.json() as Record<string, unknown>;
  const accessToken = tokens.access_token as string;
  if (!accessToken) return redirectWithClearedOAuthState(`${origin}/connections?error=no_access_token`, flowId);
  const serviceClient = createServiceClient();
  try { await upsertOAuthConnection(serviceClient, { userId, provider: "zendesk", label, tokens: { access_token: accessToken }, scopes: [], metadata: { subdomain } }); }
  catch { return redirectWithClearedOAuthState(`${origin}/connections?error=vault_failed`, flowId); }
  return redirectWithClearedOAuthState(`${origin}/connections?connected=zendesk`, flowId);
}
