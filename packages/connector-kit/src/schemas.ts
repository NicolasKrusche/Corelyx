// ─── Connector Schemas ──────────────────────────────────────────────────────
// Zod-based schema definitions for connector operations.
// These schemas define the structure of connector manifests, operations,
// and auth configurations used throughout the SDK.

import { z } from "zod";

// ─── Auth Schemas ───────────────────────────────────────────────────────────

export const AuthTypeZ = z.enum(["oauth2", "api_key", "bearer", "basic", "none"]);
export type AuthType = z.infer<typeof AuthTypeZ>;

export const OAuth2ConfigZ = z.object({
  type: z.literal("oauth2"),
  authorization_url: z.string().url(),
  token_url: z.string().url(),
  scopes: z.array(z.string()).default([]),
  client_id_ref: z.string().optional(),
  client_secret_ref: z.string().optional(),
  redirect_uri: z.string().url().optional(),
});
export type OAuth2Config = z.infer<typeof OAuth2ConfigZ>;

export const ApiKeyConfigZ = z.object({
  type: z.literal("api_key"),
  header: z.string().default("X-API-Key"),
  query_param: z.string().optional(),
});
export type ApiKeyConfig = z.infer<typeof ApiKeyConfigZ>;

export const BearerConfigZ = z.object({
  type: z.literal("bearer"),
  header: z.string().default("Authorization"),
  prefix: z.string().default("Bearer"),
});
export type BearerConfig = z.infer<typeof BearerConfigZ>;

export const BasicAuthConfigZ = z.object({
  type: z.literal("basic"),
});
export type BasicAuthConfig = z.infer<typeof BasicAuthConfigZ>;

export const NoAuthConfigZ = z.object({
  type: z.literal("none"),
});
export type NoAuthConfig = z.infer<typeof NoAuthConfigZ>;

export const AuthConfigZ = z.discriminatedUnion("type", [
  OAuth2ConfigZ,
  ApiKeyConfigZ,
  BearerConfigZ,
  BasicAuthConfigZ,
  NoAuthConfigZ,
]);
export type AuthConfig = z.infer<typeof AuthConfigZ>;

// ─── Field Schema ───────────────────────────────────────────────────────────

export const FieldKindZ = z.enum([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "integer",
  "float",
  "file",
]);
export type FieldKind = z.infer<typeof FieldKindZ>;

export const FieldSchemaZ = z.object({
  name: z.string().min(1),
  kind: FieldKindZ.default("string"),
  required: z.boolean().default(false),
  description: z.string().default(""),
  default: z.any().optional(),
  enum: z.array(z.string()).optional(),
});
export type FieldSchema = z.infer<typeof FieldSchemaZ>;

// ─── Operation Schema ───────────────────────────────────────────────────────

export const OperationSchemaZ = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, "Operation name must be snake_case"),
  description: z.string().default(""),
  input_fields: z.array(FieldSchemaZ).default([]),
  output_fields: z.array(FieldSchemaZ).default([]),
  is_destructive: z.boolean().default(false),
  is_write: z.boolean().optional(),
});
export type OperationSchemaType = z.infer<typeof OperationSchemaZ>;

// ─── Connector Manifest ─────────────────────────────────────────────────────

export const ConnectorManifestEntryZ = z.object({
  operations: z.array(
    z.object({
      name: z.string(),
      description: z.string().default(""),
      parameters: z.array(
        z.object({
          name: z.string(),
          type: z.string().optional(),
        })
      ).default([]),
    })
  ),
  operation_count: z.number(),
});
export type ConnectorManifestEntry = z.infer<typeof ConnectorManifestEntryZ>;

export const ConnectorManifestZ = z.object({
  version: z.string().default("1.0.0"),
  generated_at: z.string(),
  connector_count: z.number(),
  connectors: z.record(z.string(), ConnectorManifestEntryZ),
});
export type ConnectorManifest = z.infer<typeof ConnectorManifestZ>;

// ─── Connector Definition (SDK-level) ───────────────────────────────────────

export const ConnectorDefinitionZ = z.object({
  /** Unique provider slug (e.g. "gmail", "slack", "my_custom_api") */
  provider: z.string().min(1).regex(/^[a-z][a-z0-9_-]*$/, "Provider must be lowercase alphanumeric with hyphens/underscores"),
  /** Human-readable display name */
  display_name: z.string().min(1),
  /** Short description of what this connector does */
  description: z.string().default(""),
  /** Base URL for the API (optional) */
  base_url: z.string().url().optional(),
  /** Authentication configuration */
  auth: AuthConfigZ.default({ type: "none" }),
  /** Operation schemas this connector supports */
  operations: z.array(OperationSchemaZ).min(1, "At least one operation is required"),
  /** Default headers to send with every request */
  default_headers: z.record(z.string()).default({}),
  /** Connector version */
  version: z.string().default("1.0.0"),
  /** Whether this is a custom (user-built) connector */
  is_custom: z.boolean().default(true),
});
export type ConnectorDefinition = z.infer<typeof ConnectorDefinitionZ>;
