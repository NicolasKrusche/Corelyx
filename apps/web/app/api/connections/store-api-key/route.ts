import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { upsertOAuthConnection } from "@/lib/oauth-token";
import { checkPayPerUseConnectorAccess } from "@/lib/limits";
import { PAY_PER_USE_PROVIDERS } from "@/lib/connector-tiers";

/**
 * Store an API key (or any static credential) as a connection in Vault.
 * Used by the connections page API key dialog for providers that don't support OAuth2.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return apiError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (typeof body !== "object" || body === null) {
    return apiError("Invalid request body", 400);
  }

  const { provider, label, api_key } = body as Record<string, unknown>;

  if (typeof provider !== "string" || !provider.trim()) {
    return apiError("Missing or invalid 'provider'", 400);
  }
  if (typeof api_key !== "string" || !api_key.trim()) {
    return apiError("Missing or invalid 'api_key'", 400);
  }

  // Pay-per-use connectors require Solo plan or higher
  if (PAY_PER_USE_PROVIDERS.has(provider.trim())) {
    const access = await checkPayPerUseConnectorAccess(user.id);
    if (!access.allowed) {
      return apiError(access.upgradeMessage ?? access.reason ?? "Solo plan required", 403);
    }
  }

  const resolvedLabel =
    typeof label === "string" && label.trim()
      ? label.trim()
      : `${provider}:primary`;

  const serviceClient = createServiceClient();
  try {
    await upsertOAuthConnection(serviceClient, {
      userId: user.id,
      provider: provider.trim(),
      label: resolvedLabel,
      tokens: { access_token: api_key.trim() },
      scopes: [],
      metadata: { auth_type: "api_key" },
    });
  } catch {
    return apiError("Failed to store credentials in vault", 500);
  }

  return NextResponse.json({ ok: true, provider, label: resolvedLabel });
}
