// ─── Auth Helpers ────────────────────────────────────────────────────────────
// Auth helper utilities for building connector authentication flows.
// Provides OAuth2 flow management, API Key injection, and Bearer token handling.
// These work in both browser (web app) and Node.js (runtime) environments.

import type {
  OAuth2Config,
  ApiKeyConfig,
  BearerConfig,
  AuthConfig,
  OAuth2TokenResult,
  OAuth2AuthorizationUrl,
} from "./schemas.js";

// ─── OAuth2 Helpers ─────────────────────────────────────────────────────────

/**
 * Build an OAuth2 authorization URL for redirect-based flows.
 *
 * @param config - OAuth2 configuration from the connector definition
 * @param redirectUri - The redirect URI registered with the OAuth provider
 * @param state - CSRF protection state parameter (generate with `generateState()`)
 * @returns The authorization URL to redirect the user to
 *
 * @example
 * ```ts
 * import { buildOAuth2AuthorizationUrl, generateState } from "@flowos/connector-kit/auth";
 *
 * const state = generateState();
 * const url = buildOAuth2AuthorizationUrl(oauth2Config, "https://app.corelyx.com/auth/callback", state);
 * // Redirect user to `url`
 * ```
 */
export function buildOAuth2AuthorizationUrl(
  config: OAuth2Config,
  redirectUri: string,
  state: string,
): OAuth2AuthorizationUrl {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.client_id_ref ?? "",
    redirect_uri: redirectUri,
    scope: config.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return {
    url: `${config.authorization_url}?${params.toString()}`,
    state,
  };
}

/**
 * Exchange an authorization code for tokens.
 *
 * @param config - OAuth2 configuration
 * @param code - The authorization code from the callback
 * @param redirectUri - The same redirect URI used in the authorization request
 * @param clientSecret - The OAuth2 client secret
 * @returns Token result with access_token, refresh_token, etc.
 */
export async function exchangeOAuth2Code(
  config: OAuth2Config,
  code: string,
  redirectUri: string,
  clientSecret: string,
): Promise<OAuth2TokenResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.client_id_ref ?? "",
    client_secret: clientSecret,
  });

  const response = await fetch(config.token_url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OAuth2 token exchange failed (${response.status}): ${error}`);
  }

  return response.json() as Promise<OAuth2TokenResult>;
}

/**
 * Refresh an expired OAuth2 access token.
 *
 * @param config - OAuth2 configuration
 * @param refreshToken - The refresh token
 * @param clientSecret - The OAuth2 client secret
 * @returns New token result
 */
export async function refreshOAuth2Token(
  config: OAuth2Config,
  refreshToken: string,
  clientSecret: string,
): Promise<OAuth2TokenResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.client_id_ref ?? "",
    client_secret: clientSecret,
  });

  const response = await fetch(config.token_url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OAuth2 token refresh failed (${response.status}): ${error}`);
  }

  return response.json() as Promise<OAuth2TokenResult>;
}

/**
 * Generate a cryptographically random state parameter for OAuth2 CSRF protection.
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Auth Header Injection ──────────────────────────────────────────────────

/**
 * Build authorization headers based on auth configuration.
 *
 * @param auth - Auth configuration
 * @param credentials - The credential value (token, API key, etc.)
 * @returns Headers object to merge into fetch requests
 *
 * @example
 * ```ts
 * const headers = buildAuthHeaders(authConfig, "sk_live_xxx");
 * const response = await fetch(url, { headers });
 * ```
 */
export function buildAuthHeaders(
  auth: AuthConfig,
  credentials: string,
): Record<string, string> {
  switch (auth.type) {
    case "bearer":
      return { [auth.header]: `${auth.prefix} ${credentials}` };
    case "api_key":
      if (auth.header) {
        return { [auth.header]: credentials };
      }
      return {};
    case "basic":
      return { Authorization: `Basic ${btoa(credentials)}` };
    case "oauth2":
      return { Authorization: `Bearer ${credentials}` };
    case "none":
      return {};
    default:
      return {};
  }
}

/**
 * Build query parameters for API key auth (when key is sent as query param).
 */
export function buildAuthQueryParams(
  auth: AuthConfig,
  credentials: string,
): Record<string, string> {
  if (auth.type === "api_key" && auth.query_param) {
    return { [auth.query_param]: credentials };
  }
  return {};
}

// ─── OAuth2 Flow State Management ───────────────────────────────────────────

/**
 * In-memory store for pending OAuth2 flows.
 * In production, use a database or session store.
 */
const pendingFlows = new Map<string, { config: OAuth2Config; redirectUri: string; expiresAt: number }>();

/**
 * Store a pending OAuth2 flow for later retrieval.
 */
export function storePendingFlow(
  state: string,
  config: OAuth2Config,
  redirectUri: string,
  ttlMs: number = 10 * 60 * 1000, // 10 minutes
): void {
  pendingFlows.set(state, {
    config,
    redirectUri,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Retrieve and consume a pending OAuth2 flow by state parameter.
 * Returns null if the flow doesn't exist or has expired.
 */
export function consumePendingFlow(
  state: string,
): { config: OAuth2Config; redirectUri: string } | null {
  const flow = pendingFlows.get(state);
  if (!flow) return null;

  pendingFlows.delete(state);

  if (Date.now() > flow.expiresAt) {
    return null;
  }

  return { config: flow.config, redirectUri: flow.redirectUri };
}

/**
 * Clean up expired pending flows.
 */
export function cleanupExpiredFlows(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [state, flow] of pendingFlows) {
    if (now > flow.expiresAt) {
      pendingFlows.delete(state);
      cleaned++;
    }
  }
  return cleaned;
}
