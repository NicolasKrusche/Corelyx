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
  const label = typeof payload.label === "string" && payload.label.trim() ? payload.label : "shopify:primary";
  const shop = typeof payload.shop === "string" ? payload.shop : "";
  if (!shop) return redirectWithClearedOAuthState(`${origin}/connections?error=missing_shop`, flowId);
  const tokenRes = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, code }), cache: "no-store" });
  if (!tokenRes.ok) return redirectWithClearedOAuthState(`${origin}/connections?error=token_exchange_failed`, flowId);
  const tokens = await tokenRes.json() as Record<string, unknown>;
  const accessToken = tokens.access_token as string;
  if (!accessToken) return redirectWithClearedOAuthState(`${origin}/connections?error=no_access_token`, flowId);
  const serviceClient = createServiceClient();
  try { await upsertOAuthConnection(serviceClient, { userId, provider: "shopify", label, tokens: { access_token: accessToken }, scopes: typeof tokens.scope === "string" ? tokens.scope.split(",") : [], metadata: { shop } }); }
  catch { return redirectWithClearedOAuthState(`${origin}/connections?error=vault_failed`, flowId); }
  return redirectWithClearedOAuthState(`${origin}/connections?connected=shopify`, flowId);
}
