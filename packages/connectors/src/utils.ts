// ─── Shared Utilities ───────────────────────────────────────────────────────
// Common helpers used across enterprise connectors.

import type { OperationContext } from "@flowos/connector-kit";

/**
 * Standard error class for connector operations.
 */
export class ConnectorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

/**
 * Build auth headers from an OperationContext with an access token.
 */
export function authHeaders(
  ctx: OperationContext,
  accessToken: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    ...ctx.default_headers,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/**
 * Make an HTTP request with error handling.
 * Throws ConnectorError on non-2xx responses.
 */
export async function apiRequest<T = unknown>(
  url: string,
  options: RequestInit & { accessToken?: string; operation?: string } = {},
): Promise<T> {
  const { accessToken, operation, ...fetchOptions } = options;
  const headers: Record<string, string> = {};

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (fetchOptions.headers) {
    Object.assign(headers, fetchOptions.headers);
  }
  if (!headers["Content-Type"] && fetchOptions.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ConnectorError(
      "API_ERROR",
      `${operation ?? "Request"} failed (${response.status}): ${text.slice(0, 500)}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Make a GraphQL request.
 */
export async function graphqlRequest<T = unknown>(
  url: string,
  query: string,
  variables: Record<string, unknown>,
  accessToken: string,
  operation?: string,
): Promise<T> {
  const result = await apiRequest<{ data?: T; errors?: Array<{ message: string }> }>(url, {
    method: "POST",
    accessToken,
    operation,
    body: JSON.stringify({ query, variables }),
  });

  if (result.errors && result.errors.length > 0) {
    throw new ConnectorError(
      "GRAPHQL_ERROR",
      `${operation ?? "GraphQL request"} failed: ${result.errors.map((e) => e.message).join("; ")}`,
    );
  }

  return result.data as T;
}

/**
 * Retry with exponential backoff for rate-limited requests.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
