import { createServiceClient } from "@/lib/api";
import { upsertOAuthConnection } from "@/lib/oauth-token";
import {
  peekOAuthStateFlowId,
  redirectWithClearedOAuthState,
  verifyOAuthStateFromRequest,
} from "@/lib/oauth-state";

const SCOPES_STORED: Record<string, string[]> = {
  sheets: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
  ],
  calendar: [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar",
  ],
  docs: [
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
  ],
  drive: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive",
  ],
};

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
  const service =
    typeof payload.service === "string" && payload.service.trim()
      ? payload.service
      : "sheets";
  const label =
    typeof payload.label === "string" && payload.label.trim()
      ? payload.label
      : `${service}:primary`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/google/callback`,
      grant_type: "authorization_code",
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

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
  });
  const userInfo = userInfoRes.ok ? await userInfoRes.json() : {};

  const serviceClient = createServiceClient();
  try {
    await upsertOAuthConnection(serviceClient, {
      userId,
      provider: service,
      label,
      tokens,
      scopes: SCOPES_STORED[service] ?? [],
      metadata: { email: userInfo.email ?? null },
    });
  } catch {
    return redirectWithClearedOAuthState(
      `${origin}/connections?error=vault_failed`,
      flowId
    );
  }

  return redirectWithClearedOAuthState(
    `${origin}/connections?connected=${service}`,
    flowId
  );
}
