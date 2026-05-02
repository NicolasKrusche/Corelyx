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
  const label = typeof payload.label === "string" && payload.label.trim() ? payload.label : "stripe:primary";
  const tokenRes = await fetch("https://connect.stripe.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}` }, body: new URLSearchParams({ code, grant_type: "authorization_code" }), cache: "no-store" });
  if (!tokenRes.ok) return redirectWithClearedOAuthState(`${origin}/connections?error=token_exchange_failed`, flowId);
  const tokens = await tokenRes.json() as Record<string, unknown>;
  const accessToken = tokens.access_token as string;
  if (!accessToken) return redirectWithClearedOAuthState(`${origin}/connections?error=no_access_token`, flowId);
  const serviceClient = createServiceClient();
  try { await upsertOAuthConnection(serviceClient, { userId, provider: "stripe", label, tokens: { access_token: accessToken, refresh_token: tokens.refresh_token as string | undefined }, scopes: ["read_write"], metadata: { stripe_user_id: tokens.stripe_user_id } }); }
  catch { return redirectWithClearedOAuthState(`${origin}/connections?error=vault_failed`, flowId); }
  return redirectWithClearedOAuthState(`${origin}/connections?connected=stripe`, flowId);
}
