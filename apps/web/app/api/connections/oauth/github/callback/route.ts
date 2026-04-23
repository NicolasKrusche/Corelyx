import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/api";
import { upsertOAuthConnection } from "@/lib/oauth-token";
import { decodeOAuthState } from "@/lib/oauth-state";

function getCallbackUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  return `${appUrl.replace(/\/$/, "")}/api/connections/oauth/github/callback`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = getCallbackUrl();

  if (errorParam) return NextResponse.redirect(`${origin}/connections?error=${errorParam}`);
  if (!code || !state) return NextResponse.redirect(`${origin}/connections?error=missing_params`);
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(`${origin}/connections?error=missing_github_oauth_config`);
  }

  let userId: string;
  let label: string;
  const decoded = decodeOAuthState<{ userId?: unknown; label?: unknown }>(state);
  if (!decoded || typeof decoded.userId !== "string") {
    return NextResponse.redirect(`${origin}/connections?error=invalid_state`);
  }
  userId = decoded.userId;
  label = typeof decoded.label === "string" ? decoded.label : "github:primary";

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) return NextResponse.redirect(`${origin}/connections?error=token_exchange_failed`);

  const tokens = await tokenRes.json();
  if (tokens.error) return NextResponse.redirect(`${origin}/connections?error=${tokens.error}`);

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });
  const ghUser = userRes.ok ? await userRes.json() : {};

  const serviceClient = createServiceClient();
  try {
    await upsertOAuthConnection(serviceClient, {
      userId,
      provider: "github",
      label,
      tokens,
      scopes: ["repo", "read:user", "user:email"],
      metadata: {
        login: ghUser.login ?? null,
        email: ghUser.email ?? null,
        github_user_id: ghUser.id ?? null,
        account_type: ghUser.type ?? null,
      },
    });
  } catch {
    return NextResponse.redirect(`${origin}/connections?error=vault_failed`);
  }

  return NextResponse.redirect(`${origin}/connections?connected=github`);
}
