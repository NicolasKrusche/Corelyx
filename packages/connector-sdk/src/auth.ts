/**
 * @flowos/connector-sdk — Auth Helpers
 *
 * Authentication providers for connector implementations.
 * Provides OAuth2, API Key, Bearer, and Basic auth patterns.
 * Mirrors the Python SDK auth providers from apps/runtime/connectors/sdk/auth.py.
 */

import { type AuthType, AuthType as AuthTypeEnum } from "./types.js";

// ─── Auth Provider Interface ─────────────────────────────────────────────────

/**
 * Protocol for auth providers that inject credentials into requests.
 */
export interface AuthProvider {
  /** The authentication type this provider handles. */
  readonly authType: AuthType;

  /**
   * Apply authentication to a fetch RequestInit.
   * Returns the modified RequestInit with auth headers/params injected.
   */
  apply(requestInit: RequestInit): RequestInit | Promise<RequestInit>;
}

// ─── OAuth2 Config ───────────────────────────────────────────────────────────

/**
 * OAuth2 provider configuration.
 * Stores the token and applies it as a Bearer token.
 * For runtime use, the token should be refreshed externally before calling operations.
 */
export interface OAuth2Config {
  /** OAuth2 access token */
  accessToken: string;
  /** OAuth2 refresh token (optional, for token refresh) */
  refreshToken?: string;
  /** Token expiry timestamp (ms since epoch) */
  expiresAt?: number;
  /** OAuth2 scopes */
  scopes?: string[];
}

/**
 * OAuth2 authentication provider.
 * Injects the access token as a Bearer token in the Authorization header.
 *
 * @example
 * ```ts
 * const auth = new OAuth2Provider({
 *   accessToken: "ya29.a0AfH6SMB...",
 *   refreshToken: "1//0g...",
 *   expiresAt: Date.now() + 3600_000,
 * });
 *
 * const response = await fetch(url, auth.apply({ method: "GET" }));
 * ```
 */
export class OAuth2Provider implements AuthProvider {
  readonly authType = AuthTypeEnum.OAUTH2;
  private config: OAuth2Config;

  constructor(config: OAuth2Config) {
    this.config = config;
  }

  get accessToken(): string {
    return this.config.accessToken;
  }

  get refreshToken(): string | undefined {
    return this.config.refreshToken;
  }

  get expiresAt(): number | undefined {
    return this.config.expiresAt;
  }

  get scopes(): string[] | undefined {
    return this.config.scopes;
  }

  /**
   * Check if the token is likely expired (with a 60s buffer).
   */
  isExpired(): boolean {
    if (!this.config.expiresAt) return false;
    return Date.now() >= this.config.expiresAt - 60_000;
  }

  apply(requestInit: RequestInit): RequestInit {
    const headers = new Headers(requestInit.headers);
    headers.set("Authorization", `Bearer ${this.config.accessToken}`);
    return { ...requestInit, headers };
  }
}

// ─── API Key Provider ────────────────────────────────────────────────────────

/**
 * API Key provider configuration.
 */
export interface ApiKeyConfig {
  /** The API key value */
  key: string;
  /** Header name to use (default: "X-API-Key") */
  header?: string;
  /** Query parameter name (alternative to header) */
  queryParam?: string;
}

/**
 * API Key authentication provider.
 * Injects the API key via a configurable header or query parameter.
 *
 * @example
 * ```ts
 * // Header-based (default)
 * const auth = new ApiKeyProvider({ key: "sk_live_..." });
 *
 * // Custom header
 * const auth = new ApiKeyProvider({ key: "xxx", header: "Authorization" });
 *
 * // Query param
 * const auth = new ApiKeyProvider({ key: "xxx", queryParam: "api_key" });
 * ```
 */
export class ApiKeyProvider implements AuthProvider {
  readonly authType = AuthTypeEnum.API_KEY;
  private config: ApiKeyConfig;

  constructor(config: ApiKeyConfig) {
    this.config = {
      header: "X-API-Key",
      ...config,
    };
  }

  get key(): string {
    return this.config.key;
  }

  apply(requestInit: RequestInit): RequestInit {
    const url = new URL(requestInit.url ?? "/", "http://localhost");
    const headers = new Headers(requestInit.headers);

    if (this.config.header) {
      headers.set(this.config.header, this.config.key);
    }

    let modifiedUrl = requestInit.url;
    if (this.config.queryParam && modifiedUrl) {
      const urlObj = new URL(modifiedUrl);
      urlObj.searchParams.set(this.config.queryParam, this.config.key);
      modifiedUrl = urlObj.toString();
    }

    return { ...requestInit, headers, url: modifiedUrl };
  }
}

// ─── Bearer Provider ─────────────────────────────────────────────────────────

/**
 * Bearer token authentication provider.
 * The simplest auth pattern — injects a static bearer token.
 *
 * @example
 * ```ts
 * const auth = new BearerProvider("ghp_xxxxxxxxxxxx");
 * const response = await fetch(url, auth.apply({ method: "GET" }));
 * ```
 */
export class BearerProvider implements AuthProvider {
  readonly authType = AuthTypeEnum.BEARER;
  private _token: string;

  constructor(token: string) {
    this._token = token;
  }

  get token(): string {
    return this._token;
  }

  apply(requestInit: RequestInit): RequestInit {
    const headers = new Headers(requestInit.headers);
    headers.set("Authorization", `Bearer ${this._token}`);
    return { ...requestInit, headers };
  }
}

// ─── Basic Auth Provider ─────────────────────────────────────────────────────

/**
 * HTTP Basic authentication provider.
 *
 * @example
 * ```ts
 * const auth = new BasicAuthProvider("user", "pass");
 * const response = await fetch(url, auth.apply({ method: "GET" }));
 * ```
 */
export class BasicAuthProvider implements AuthProvider {
  readonly authType = AuthTypeEnum.BASIC;
  private username: string;
  private password: string;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  apply(requestInit: RequestInit): RequestInit {
    const encoded = btoa(`${this.username}:${this.password}`);
    const headers = new Headers(requestInit.headers);
    headers.set("Authorization", `Basic ${encoded}`);
    return { ...requestInit, headers };
  }
}

// ─── No Auth Provider ────────────────────────────────────────────────────────

/**
 * No-op auth provider for connectors that don't need authentication (e.g. webhooks).
 */
export class NoAuthProvider implements AuthProvider {
  readonly authType = AuthTypeEnum.NONE;

  apply(requestInit: RequestInit): RequestInit {
    return requestInit;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create an auth provider from configuration.
 */
export function createAuthProvider(
  type: AuthType,
  config: Record<string, unknown>
): AuthProvider {
  switch (type) {
    case AuthTypeEnum.OAUTH2:
      return new OAuth2Provider({
        accessToken: config.accessToken as string,
        refreshToken: config.refreshToken as string | undefined,
        expiresAt: config.expiresAt as number | undefined,
        scopes: config.scopes as string[] | undefined,
      });
    case AuthTypeEnum.API_KEY:
      return new ApiKeyProvider({
        key: config.key as string,
        header: config.header as string | undefined,
        queryParam: config.queryParam as string | undefined,
      });
    case AuthTypeEnum.BEARER:
      return new BearerProvider(config.token as string);
    case AuthTypeEnum.BASIC:
      return new BasicAuthProvider(
        config.username as string,
        config.password as string
      );
    case AuthTypeEnum.NONE:
      return new NoAuthProvider();
    default:
      throw new Error(`Unknown auth type: ${type}`);
  }
}

// ─── Auth Config Zod Schemas ─────────────────────────────────────────────────

import { z } from "zod";

export const OAuth2ConfigSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  scopes: z.array(z.string()).optional(),
});

export const ApiKeyConfigSchema = z.object({
  key: z.string().min(1),
  header: z.string().optional().default("X-API-Key"),
  queryParam: z.string().optional(),
});

export const BearerConfigSchema = z.object({
  token: z.string().min(1),
});

export const BasicConfigSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
