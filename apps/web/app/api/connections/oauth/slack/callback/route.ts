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
      : "slack:primary";

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/slack/callback`,
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
  if (!tokens.ok) {
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=${tokens.error ?? "slack_error"}`,
      flowId
    );
  }

  const teamName: string = tokens.team?.name ?? "";
  const teamId: string | null = tokens.team?.id ?? null;
  const botToken: string = tokens.access_token;

  const serviceClient = createServiceClient();
  try {
    await upsertOAuthConnection(serviceClient, {
      userId,
      provider: "slack",
      label,
      tokens: { access_token: botToken, team: tokens.team },
      scopes: ["channels:read", "channels:history", "chat:write", "app_mentions:read"],
      metadata: {
        team: teamName,
        team_id: teamId,
        bot_user_id: tokens.bot_user_id ?? null,
        app_id: tokens.app_id ?? null,
      },
    });
  } catch {
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=vault_failed`,
      flowId
    );
  }

  return redirectWithClearedOAuthState(
    `${origin}/connections?connected=slack`,
    flowId
  );
}
