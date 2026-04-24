import { createServiceClient } from "@/lib/api";
import { upsertOAuthConnection } from "@/lib/oauth-token";
import {
  peekOAuthStateFlowId,
  redirectWithClearedOAuthState,
  verifyOAuthStateFromRequest,
} from "@/lib/oauth-state";

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
      : "notion:primary";

  // Notion requires Basic auth with client_id:client_secret
  const credentials = Buffer.from(
    `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
  ).toString("base64");

  const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/notion/callback`,
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
  const workspaceName: string = tokens.workspace_name ?? "";

  const serviceClient = createServiceClient();
  try {
    await upsertOAuthConnection(serviceClient, {
      userId,
      provider: "notion",
      label,
      tokens,
      scopes: ["read_content", "update_content", "insert_content"],
      metadata: { workspace: workspaceName },
    });
  } catch {
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=vault_failed`,
      flowId
    );
  }

  return redirectWithClearedOAuthState(
    `${origin}/connections?connected=notion`,
    flowId
  );
}
