// ─── Connector Types ────────────────────────────────────────────────────────
// TypeScript interfaces and type definitions for the Connector SDK.
// Mirrors the Python SDK types in apps/runtime/connectors/sdk/types.py
// and the web app types in apps/web/lib/genesis/connector-manifest.ts.

import type { z } from "zod";
import type {
  AuthConfig,
  ConnectorDefinition,
  ConnectorManifest,
  FieldSchema,
  OperationSchemaType,
} from "./schemas.js";

// ─── Operation Handler ──────────────────────────────────────────────────────

/**
 * Context passed to every operation handler.
 * Contains auth credentials, configuration, and utility methods.
 */
export interface OperationContext<TAuth = Record<string, unknown>> {
  /** The auth credentials/config for this execution */
  auth: TAuth;
  /** The base URL of the connector API */
  base_url: string;
  /** Default headers for the connector */
  default_headers: Record<string, string>;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * A typed connector operation handler.
 *
 * @typeParam TInput - Zod schema type for the operation input
 * @typeParam TOutput - Zod schema type for the operation output
 * @typeParam TAuth - Type of the auth context (defaults to Record<string, unknown>)
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import type { ConnectorOperation } from "@flowos/connector-kit";
 *
 * const listEmailsInput = z.object({
 *   query: z.string().optional(),
 *   max_results: z.number().int().min(1).max(500).default(10),
 * });
 *
 * const listEmailsOutput = z.object({
 *   emails: z.array(z.object({
 *     id: z.string(),
 *     subject: z.string(),
 *     from: z.string(),
 *   })),
 *   next_page_token: z.string().optional(),
 * });
 *
 * const listEmails: ConnectorOperation<typeof listEmailsInput, typeof listEmailsOutput> = {
 *   name: "list_emails",
 *   description: "List emails matching a query",
 *   input: listEmailsInput,
 *   output: listEmailsOutput,
 *   execute: async (input, ctx) => {
 *     const response = await fetch(
 *       `${ctx.base_url}/messages?q=${input.query || ""}&maxResults=${input.max_results}`,
 *       { headers: { ...ctx.default_headers, Authorization: `Bearer ${ctx.auth.access_token}` } }
 *     );
 *     const data = await response.json();
 *     return { emails: data.messages || [], next_page_token: data.nextPageToken };
 *   },
 * };
 * ```
 */
export interface ConnectorOperation<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
  TAuth = Record<string, unknown>,
> {
  /** Unique operation name (snake_case) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Zod schema for validating operation input */
  input: TInput;
  /** Zod schema for validating operation output */
  output: TOutput;
  /** The operation handler function */
  execute: (input: z.infer<TInput>, ctx: OperationContext<TAuth>) => Promise<z.infer<TOutput>>;
}

// ─── Connector Definition (runtime) ─────────────────────────────────────────

/**
 * A fully-defined connector with typed operations.
 * This is the runtime representation used by the Corelyx engine.
 */
export interface Connector<TAuth = Record<string, unknown>> {
  /** Unique provider slug */
  provider: string;
  /** Human-readable display name */
  display_name: string;
  /** Short description */
  description: string;
  /** Base URL for the API */
  base_url?: string;
  /** Auth configuration */
  auth: AuthConfig;
  /** Default headers */
  default_headers: Record<string, string>;
  /** All operations this connector supports */
  operations: ConnectorOperation[];
  /** Connector version */
  version: string;
}

// ─── Manifest Types ─────────────────────────────────────────────────────────

/** Entry in the generated connectors.manifest.json */
export interface ManifestOperation {
  name: string;
  description: string;
  parameters: Array<{ name: string; type?: string }>;
}

export interface ManifestConnectorEntry {
  operations: ManifestOperation[];
  operation_count: number;
}

/** Full manifest structure (matches packages/schema/connectors.manifest.json) */
export interface ManifestData {
  version: string;
  generated_at: string;
  connector_count: number;
  connectors: Record<string, ManifestConnectorEntry>;
}

// ─── Auth Result Types ──────────────────────────────────────────────────────

export interface OAuth2TokenResult {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface OAuth2AuthorizationUrl {
  url: string;
  state: string;
}

// ─── Build & Test Types ─────────────────────────────────────────────────────

export interface BuildResult {
  /** Path to the generated manifest file */
  manifest_path: string;
  /** Number of connectors scanned */
  connector_count: number;
  /** Number of operations found */
  operation_count: number;
  /** Any warnings during build */
  warnings: string[];
}

export interface TestResult {
  /** Provider being tested */
  provider: string;
  /** Operation being tested */
  operation: string;
  /** Whether the test passed */
  passed: boolean;
  /** Validation errors (if any) */
  errors: string[];
  /** Execution time in ms */
  duration_ms: number;
}

// ─── CLI Types ──────────────────────────────────────────────────────────────

export interface InitOptions {
  /** Directory to create the connector in */
  directory: string;
  /** Provider slug */
  provider?: string;
  /** Auth type to scaffold */
  auth_type?: "oauth2" | "api_key" | "bearer" | "none";
}

export interface BuildOptions {
  /** Directory to scan for connectors */
  directory?: string;
  /** Output path for the manifest */
  output?: string;
  /** Merge with existing manifest */
  merge?: boolean;
}

export interface TestOptions {
  /** Provider to test (or "all") */
  provider?: string;
  /** Specific operation to test */
  operation?: string;
  /** Path to test fixture directory */
  fixtures?: string;
}
