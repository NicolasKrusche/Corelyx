/**
 * OAuth token management — server-side only.
 * Handles token refresh for providers with expiring access tokens.
 * Tokens are NEVER sent to the frontend.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@flowos/db";
import { vaultStore, vaultRetrieve, vaultDelete } from "@/lib/vault";
import { getActiveWorkspace } from "@/lib/workspaces";

type Client = SupabaseClient<Database>;

// Seconds before expiry at which we proactively refresh
const REFRESH_THRESHOLD_SECONDS = 300; // 5 minutes

interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number; // unix ms — added by storeOAuthTokens()
  token_type?: string;
  scope?: string;
  [key: string]: unknown;
}

type RefreshFailureSummary = {
  errorCode: string | null;
  logMessage: string;
  userMessage: string;
};

// Provider refresh config: endpoint + how to pass client credentials
const PROVIDER_REFRESH: Record<string, {
  endpoint: string;
  auth: "form" | "basic"; // "form" = client_id/secret in body; "basic" = Authorization header
  clientIdEnv: string;
  clientSecretEnv: string;
}> = {
  gmail:    { endpoint: "https://oauth2.googleapis.com/token",                           auth: "form", clientIdEnv: "GOOGLE_CLIENT_ID",    clientSecretEnv: "GOOGLE_CLIENT_SECRET" },
  sheets:   { endpoint: "https://oauth2.googleapis.com/token",                           auth: "form", clientIdEnv: "GOOGLE_CLIENT_ID",    clientSecretEnv: "GOOGLE_CLIENT_SECRET" },
  calendar: { endpoint: "https://oauth2.googleapis.com/token",                           auth: "form", clientIdEnv: "GOOGLE_CLIENT_ID",    clientSecretEnv: "GOOGLE_CLIENT_SECRET" },
  docs:     { endpoint: "https://oauth2.googleapis.com/token",                           auth: "form", clientIdEnv: "GOOGLE_CLIENT_ID",    clientSecretEnv: "GOOGLE_CLIENT_SECRET" },
  drive:    { endpoint: "https://oauth2.googleapis.com/token",                           auth: "form", clientIdEnv: "GOOGLE_CLIENT_ID",    clientSecretEnv: "GOOGLE_CLIENT_SECRET" },
  hubspot:  { endpoint: "https://api.hubapi.com/oauth/v1/token",                         auth: "form", clientIdEnv: "HUBSPOT_CLIENT_ID",   clientSecretEnv: "HUBSPOT_CLIENT_SECRET" },
  airtable: { endpoint: "https://airtable.com/oauth2/v1/token",                          auth: "basic", clientIdEnv: "AIRTABLE_CLIENT_ID", clientSecretEnv: "AIRTABLE_CLIENT_SECRET" },
  outlook:  { endpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",   auth: "form", clientIdEnv: "MICROSOFT_CLIENT_ID",  clientSecretEnv: "MICROSOFT_CLIENT_SECRET" },
  asana:    { endpoint: "https://app.asana.com/-/oauth_token",                           auth: "form", clientIdEnv: "ASANA_CLIENT_ID",     clientSecretEnv: "ASANA_CLIENT_SECRET" },
  typeform:  { endpoint: "https://api.typeform.com/oauth/token",                          auth: "form",  clientIdEnv: "TYPEFORM_CLIENT_ID",        clientSecretEnv: "TYPEFORM_CLIENT_SECRET" },
  linkedin:  { endpoint: "https://www.linkedin.com/oauth/v2/accessToken",                auth: "form",  clientIdEnv: "LINKEDIN_CLIENT_ID",        clientSecretEnv: "LINKEDIN_CLIENT_SECRET" },
  facebook:  { endpoint: "https://graph.facebook.com/v19.0/oauth/access_token",         auth: "form",  clientIdEnv: "FACEBOOK_CLIENT_ID",        clientSecretEnv: "FACEBOOK_CLIENT_SECRET" },
  instagram: { endpoint: "https://api.instagram.com/oauth/access_token",                auth: "form",  clientIdEnv: "INSTAGRAM_CLIENT_ID",       clientSecretEnv: "INSTAGRAM_CLIENT_SECRET" },
  dropbox:   { endpoint: "https://api.dropboxapi.com/oauth2/token",                     auth: "basic", clientIdEnv: "DROPBOX_CLIENT_ID",         clientSecretEnv: "DROPBOX_CLIENT_SECRET" },
  reddit:    { endpoint: "https://www.reddit.com/api/v1/access_token",                  auth: "basic", clientIdEnv: "REDDIT_CLIENT_ID",          clientSecretEnv: "REDDIT_CLIENT_SECRET" },
  twitter:   { endpoint: "https://api.twitter.com/2/oauth2/token",                      auth: "basic", clientIdEnv: "TWITTER_CLIENT_ID",         clientSecretEnv: "TWITTER_CLIENT_SECRET" },
  webflow:   { endpoint: "https://api.webflow.com/oauth/access_token",                  auth: "form",  clientIdEnv: "WEBFLOW_CLIENT_ID",         clientSecretEnv: "WEBFLOW_CLIENT_SECRET" },
  wordpress: { endpoint: "https://public-api.wordpress.com/oauth2/token",               auth: "form",  clientIdEnv: "WORDPRESS_CLIENT_ID",       clientSecretEnv: "WORDPRESS_CLIENT_SECRET" },
  miro:      { endpoint: "https://api.miro.com/v1/oauth/token",                         auth: "form",  clientIdEnv: "MIRO_CLIENT_ID",            clientSecretEnv: "MIRO_CLIENT_SECRET" },
  vimeo:     { endpoint: "https://api.vimeo.com/oauth/access_token",                    auth: "basic", clientIdEnv: "VIMEO_CLIENT_ID",           clientSecretEnv: "VIMEO_CLIENT_SECRET" },
  pinterest: { endpoint: "https://api.pinterest.com/v5/oauth/token",                    auth: "basic", clientIdEnv: "PINTEREST_CLIENT_ID",       clientSecretEnv: "PINTEREST_CLIENT_SECRET" },
  hootsuite: { endpoint: "https://platform.hootsuite.com/oauth2/token",                 auth: "basic", clientIdEnv: "HOOTSUITE_CLIENT_ID",       clientSecretEnv: "HOOTSUITE_CLIENT_SECRET" },
};

// Providers with non-expiring tokens — never refresh
const NON_EXPIRING = new Set(["slack", "notion", "github"]);

export function summarizeRefreshFailure(
  provider: string,
  status: number,
  responseText: string,
  headers: Headers
): RefreshFailureSummary {
  let errorCode: string | null = null;

  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    const code = parsed.error ?? parsed.error_code ?? parsed.code;
    if (typeof code === "string" && code.trim()) {
      errorCode = code.trim();
    }
  } catch {
    errorCode = null;
  }

  const requestId =
    headers.get("x-request-id") ??
    headers.get("request-id") ??
    headers.get("x-correlation-id");

  const details = [
    `provider=${provider}`,
    `status=${status}`,
    errorCode ? `error_code=${errorCode}` : null,
    requestId ? `request_id=${requestId}` : null,
  ].filter(Boolean);

  return {
    errorCode,
    logMessage: `[oauth-token] refresh failed (${details.join(", ")})`,
    userMessage: `Token refresh failed for ${provider} (HTTP ${status}${errorCode ? `, error ${errorCode}` : ""}). Please reconnect.`,
  };
}

/**
 * Upsert an OAuth connection: store tokens in Vault and create or update the
 * connections row.  Handles reconnect by reusing the existing row (preserving
 * its UUID so program_connections FK references stay intact) and deleting the
 * old Vault secret.  Uses a timestamped Vault name so the unique constraint is
 * never hit.
 */
export async function upsertOAuthConnection(
  supabase: Client,
  params: {
    userId: string;
    provider: string;
    label: string;
    tokens: StoredTokens;
    scopes: string[];
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  // Timestamped name guarantees uniqueness on every connect/reconnect
  const vaultName = `oauth:${params.userId}:${params.provider}:${params.label}:${Date.now()}`;
  const newVaultId = await storeOAuthTokens(
    supabase,
    params.tokens,
    vaultName,
    `${params.provider} OAuth tokens for user ${params.userId}`,
  );

  // Resolve workspace for this user — required by the NOT NULL constraint on connections.workspace_id
  const workspace = await getActiveWorkspace(params.userId);
  if (!workspace) throw new Error(`No active workspace found for user ${params.userId}`);

  // Look up any existing connections rows for this user + label
  const { data: existing } = await supabase
    .from("connections")
    .select("id, vault_secret_id")
    .eq("user_id", params.userId)
    .eq("name", params.label);

  const rows = (existing ?? []) as Array<{ id: string; vault_secret_id: string }>;

  if (rows.length > 0) {
    const [primary, ...extras] = rows;

    // Delete old Vault secret for the primary row (best-effort)
    try { await vaultDelete(supabase, primary.vault_secret_id); } catch { /* ok */ }

    // Clean up any duplicate rows (shouldn't normally exist)
    for (const extra of extras) {
      try { await vaultDelete(supabase, extra.vault_secret_id); } catch { /* ok */ }
      await supabase.from("connections").delete().eq("id", extra.id);
    }

    // Update the primary row in-place (preserves its UUID → program_connections stay intact)
    const { error } = await supabase
      .from("connections")
      .update({
        vault_secret_id: newVaultId,
        scopes: params.scopes,
        metadata: params.metadata,
        is_valid: true,
        last_validated_at: new Date().toISOString(),
      } as never)
      .eq("id", primary.id);
    if (error) throw new Error(`DB update failed: ${error.message}`);
  } else {
    const { error } = await supabase.from("connections").insert({
      user_id: params.userId,
      workspace_id: workspace.workspaceId,
      name: params.label,
      provider: params.provider,
      auth_type: "oauth",
      vault_secret_id: newVaultId,
      scopes: params.scopes,
      metadata: params.metadata,
      is_valid: true,
      last_validated_at: new Date().toISOString(),
    } as never);
    if (error) throw new Error(`DB insert failed: ${error.message}`);
  }
}

/**
 * Store OAuth tokens in Vault, adding expires_at for refresh tracking.
 * All OAuth callbacks should use this instead of vaultStore(JSON.stringify(tokens)) directly.
 */
export async function storeOAuthTokens(
  supabase: Client,
  tokens: StoredTokens,
  name: string,
  description?: string
): Promise<string> {
  const withExpiry: StoredTokens = {
    ...tokens,
    expires_at: tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : undefined,
  };
  return vaultStore(supabase, JSON.stringify(withExpiry), name, description);
}

/**
 * Update tokens in an existing Vault secret (for refresh).
 * Re-stores the secret with the same name by deleting + re-inserting.
 * Since vault_store_secret creates a new record, we update the connection row's vault_secret_id.
 */
async function rotateVaultTokens(
  supabase: Client,
  connectionId: string,
  vaultSecretId: string,
  newTokens: StoredTokens,
  vaultName: string
): Promise<string> {
  const withExpiry: StoredTokens = {
    ...newTokens,
    expires_at: newTokens.expires_in
      ? Date.now() + newTokens.expires_in * 1000
      : Date.now() + 3600 * 1000, // default 1h if not specified
  };

  // Delete the old vault secret first so the name slot is free for re-use.
  // Ignore errors — the old record may have already been deleted or the id stale.
  try {
    await vaultDelete(supabase, vaultSecretId);
  } catch {
    // non-fatal
  }

  // Store new tokens (creates a new vault record)
  const newVaultId = await vaultStore(
    supabase,
    JSON.stringify(withExpiry),
    vaultName,
    "Refreshed OAuth tokens"
  );

  // Update connection row to point to new vault record
  await supabase
    .from("connections")
    .update({
      vault_secret_id: newVaultId,
      is_valid: true,
      last_validated_at: new Date().toISOString(),
    } as never)
    .eq("id", connectionId);

  return newVaultId;
}

/**
 * Retrieve a valid access token for a connection, refreshing if near expiry.
 * This is the only function the rest of the app should call for OAuth tokens.
 */
export async function getValidOAuthToken(
  supabase: Client,
  connectionId: string,
  forceRefresh = false,
): Promise<string> {
  // Fetch connection row
  const { data: conn, error: connErr } = await supabase
    .from("connections")
    .select("id, provider, vault_secret_id, metadata")
    .eq("id", connectionId)
    .single();

  if (connErr || !conn) throw new Error(`Connection ${connectionId} not found${connErr ? `: ${connErr.message}` : ""}`);

  type ConnRow = { id: string; provider: string; vault_secret_id: string; metadata: Record<string, unknown> | null };
  const connection = conn as unknown as ConnRow;

  // Non-expiring providers — just return the token directly
  if (NON_EXPIRING.has(connection.provider)) {
    const raw = await vaultRetrieve(supabase, connection.vault_secret_id);
    const tokens: StoredTokens = JSON.parse(raw);
    return tokens.access_token;
  }

  const raw = await vaultRetrieve(supabase, connection.vault_secret_id);
  let tokens: StoredTokens;
  try {
    tokens = JSON.parse(raw);
  } catch {
    throw new Error(`Vault secret for connection ${connectionId} (provider: ${connection.provider}) contains invalid JSON — the token may be corrupted. Please reconnect.`);
  }

  // Check if token is still valid (with threshold)
  const nowMs = Date.now();
  const expiresAt = tokens.expires_at;
  const isValid = !forceRefresh && (expiresAt
    ? expiresAt > nowMs + REFRESH_THRESHOLD_SECONDS * 1000
    : false); // no expiry stored → assume stale, attempt refresh

  if (isValid) return tokens.access_token;

  // Attempt refresh
  if (!tokens.refresh_token) {
    // Can't refresh — mark connection invalid
    await supabase
      .from("connections")
      .update({ is_valid: false } as never)
      .eq("id", connectionId);
    throw new Error(`Connection ${connection.provider} token is expired and has no refresh token. Please reconnect.`);
  }

  const config = PROVIDER_REFRESH[connection.provider];
  if (!config) {
    // Unknown provider — return as-is
    return tokens.access_token;
  }

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new Error(`Missing OAuth credentials for provider ${connection.provider}`);
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    ...(config.auth === "form" ? { client_id: clientId, client_secret: clientSecret } : {}),
  });

  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (config.auth === "basic") {
    headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  // IMPORTANT: cache: "no-store" - App Router can cache fetch() in route
  // handlers, which would return the same stale access_token on every refresh and
  // leave the connection permanently broken once the first one expired.
  const refreshRes = await fetch(config.endpoint, { method: "POST", headers, body, cache: "no-store" });
  const respText = await refreshRes.text();

  if (!refreshRes.ok) {
    await supabase.from("connections").update({ is_valid: false } as never).eq("id", connectionId);
    const summary = summarizeRefreshFailure(
      connection.provider,
      refreshRes.status,
      respText,
      refreshRes.headers
    );
    console.error(summary.logMessage);
    throw new Error(summary.userMessage);
  }

  let refreshed: StoredTokens;
  try {
    refreshed = JSON.parse(respText);
  } catch {
    throw new Error(
      `Token refresh for ${connection.provider} returned a non-JSON response.`
    );
  }
  if (!refreshed.access_token) {
    throw new Error(`Token refresh for ${connection.provider} succeeded but response has no access_token. Keys: ${Object.keys(refreshed).join(", ")}`);
  }

  // Preserve the existing refresh_token if provider didn't return a new one
  const newTokens: StoredTokens = {
    ...tokens,
    ...refreshed,
    refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
  };

  // Each refresh gets a unique name so the vault unique constraint is never hit.
  const vaultName = `oauth:${connectionId}:${Date.now()}`;
  await rotateVaultTokens(supabase, connectionId, connection.vault_secret_id, newTokens, vaultName);

  return newTokens.access_token;
}
