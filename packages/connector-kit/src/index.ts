// ─── @flowos/connector-kit ───────────────────────────────────────────────────
// SDK for building custom Corelyx connectors.
//
// Quick start:
//   import { defineConnector, ConnectorOperation } from "@flowos/connector-kit";
//   import { z } from "zod";
//
// See README.md for full usage examples.

// Re-export all schemas
export {
  AuthTypeZ,
  OAuth2ConfigZ,
  ApiKeyConfigZ,
  BearerConfigZ,
  BasicAuthConfigZ,
  NoAuthConfigZ,
  AuthConfigZ,
  FieldKindZ,
  FieldSchemaZ,
  OperationSchemaZ,
  ConnectorManifestEntryZ,
  ConnectorManifestZ,
  ConnectorDefinitionZ,
} from "./schemas.js";

export type {
  AuthType,
  AuthConfig,
  OAuth2Config,
  ApiKeyConfig,
  BearerConfig,
  BasicAuthConfig,
  NoAuthConfig,
  FieldKind,
  FieldSchema,
  OperationSchemaType,
  ConnectorManifestEntry,
  ConnectorManifest,
  ConnectorDefinition,
} from "./schemas.js";

// Re-export types
export type {
  OperationContext,
  ConnectorOperation,
  Connector,
  ManifestOperation,
  ManifestConnectorEntry,
  ManifestData,
  OAuth2TokenResult,
  OAuth2AuthorizationUrl,
  BuildResult,
  TestResult,
  InitOptions,
  BuildOptions,
  TestOptions,
} from "./types.js";

// Re-export auth helpers
export {
  buildOAuth2AuthorizationUrl,
  exchangeOAuth2Code,
  refreshOAuth2Token,
  generateState,
  buildAuthHeaders,
  buildAuthQueryParams,
  storePendingFlow,
  consumePendingFlow,
  cleanupExpiredFlows,
} from "./auth.js";

// Re-export manifest helpers
export {
  connectorToManifestEntry,
  buildManifest,
  serializeManifest,
  parseManifest,
  searchManifestOperations,
  getProviderOperations,
  listProviders,
} from "./manifest.js";

// Re-export hot-load support
export {
  scanCustomConnectors,
  loadAndMergeCustomConnectors,
  generateHotLoadManifest,
  ConnectorRegistry,
  getConnectorRegistry,
  initializeHotLoad,
} from "./hotload.js";

// ─── defineConnector Helper ─────────────────────────────────────────────────

import type { Connector, ConnectorOperation } from "./types.js";
import { ConnectorDefinitionZ } from "./schemas.js";

/**
 * Helper function to define a connector with full type safety.
 *
 * @example
 * ```ts
 * import { defineConnector } from "@flowos/connector-kit";
 * import { z } from "zod";
 *
 * const myConnector = defineConnector({
 *   provider: "myapi",
 *   display_name: "My API",
 *   description: "Connect to my custom API",
 *   base_url: "https://api.myapi.com/v1",
 *   auth: { type: "bearer", header: "Authorization", prefix: "Bearer" },
 *   operations: [
 *     {
 *       name: "get_users",
 *       description: "List all users",
 *       input: z.object({ limit: z.number().default(10) }),
 *       output: z.object({ users: z.array(z.object({ id: z.string(), name: z.string() })) }),
 *       execute: async (input, ctx) => {
 *         const res = await fetch(`${ctx.base_url}/users?limit=${input.limit}`, {
 *           headers: { ...ctx.default_headers, ...buildAuthHeaders(ctx.auth, "token") },
 *         });
 *         return res.json();
 *       },
 *     },
 *   ],
 * });
 * ```
 */
export function defineConnector<TAuth extends Record<string, unknown> = Record<string, unknown>>(
  definition: Connector<TAuth> & {
    version?: string;
  },
): Connector<TAuth> {
  return {
    version: definition.version ?? "1.0.0",
    ...definition,
  };
}

/**
 * Helper function to define a single connector operation with full type safety.
 */
export function defineOperation<
  TInput extends import("zod").ZodType,
  TOutput extends import("zod").ZodType,
  TAuth = Record<string, unknown>,
>(
  operation: ConnectorOperation<TInput, TOutput, TAuth>,
): ConnectorOperation<TInput, TOutput, TAuth> {
  return operation;
}

/**
 * Validate a connector definition against the schema.
 * Returns the validated definition or throws with detailed errors.
 */
export function validateConnector(definition: unknown): ConnectorDefinition {
  return ConnectorDefinitionZ.parse(definition);
}

/**
 * Safely validate a connector definition.
 * Returns [validated, null] on success or [null, error] on failure.
 */
export function safeValidateConnector(
  definition: unknown,
): [ConnectorDefinition, null] | [null, Error] {
  try {
    return [ConnectorDefinitionZ.parse(definition), null];
  } catch (e) {
    return [null, e instanceof Error ? e : new Error(String(e))];
  }
}
