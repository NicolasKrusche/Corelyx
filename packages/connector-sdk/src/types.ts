/**
 * @flowos/connector-sdk — Types
 *
 * Shared types for the Corelyx Connector SDK.
 * Mirrors the Python SDK types from apps/runtime/connectors/sdk/types.py
 * and extends them with TypeScript-native patterns (Zod schemas).
 */

import { z } from "zod";

// ─── Auth Types ──────────────────────────────────────────────────────────────

/**
 * Supported authentication methods for connectors.
 */
export const AuthType = {
  OAUTH2: "oauth2",
  API_KEY: "api_key",
  BASIC: "basic",
  BEARER: "bearer",
  NONE: "none",
} as const;

export type AuthType = (typeof AuthType)[keyof typeof AuthType];

// ─── Field Kinds ─────────────────────────────────────────────────────────────

/**
 * Parameter field kinds for schema definitions.
 * Maps to the Python SDK's FieldKind enum.
 */
export const FieldKind = {
  STRING: "string",
  INTEGER: "integer",
  FLOAT: "float",
  BOOLEAN: "boolean",
  OBJECT: "object",
  ARRAY: "array",
  FILE: "file",
} as const;

export type FieldKind = (typeof FieldKind)[keyof typeof FieldKind];

// ─── Field Schema ────────────────────────────────────────────────────────────

/**
 * Describes one input or output field for a connector operation.
 */
export interface FieldSchema {
  name: string;
  kind: FieldKind;
  required?: boolean;
  description?: string;
  default?: unknown;
  enum?: string[];
}

/**
 * Zod schema for validating a FieldSchema definition.
 */
export const FieldSchemaSchema = z.object({
  name: z.string().min(1),
  kind: z.nativeEnum(FieldKind as unknown as Record<string, string>),
  required: z.boolean().optional().default(false),
  description: z.string().optional().default(""),
  default: z.unknown().optional(),
  enum: z.array(z.string()).optional(),
});

/**
 * Convert a FieldSchema to the JSON format used in connector manifests.
 */
export function fieldToManifest(field: FieldSchema): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    name: field.name,
    type: field.kind,
    required: field.required ?? false,
  };
  if (field.description) entry.description = field.description;
  if (field.default !== undefined) entry.default = field.default;
  if (field.enum) entry.enum = field.enum;
  return entry;
}

// ─── Operation Schema ────────────────────────────────────────────────────────

/**
 * Schema for a single connector operation.
 */
export interface OperationSchema {
  name: string;
  description?: string;
  inputFields: FieldSchema[];
  outputFields: FieldSchema[];
  isDestructive?: boolean;
  isWrite?: boolean;
}

/**
 * Zod schema for validating an OperationSchema definition.
 */
export const OperationSchemaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  inputFields: z.array(FieldSchemaSchema).default([]),
  outputFields: z.array(FieldSchemaSchema).default([]),
  isDestructive: z.boolean().optional().default(false),
  isWrite: z.boolean().optional(),
});

/**
 * Convert an OperationSchema to the JSON format used in connector manifests.
 */
export function operationToManifest(op: OperationSchema): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    name: op.name,
    input_fields: op.inputFields.map(fieldToManifest),
    output_fields: op.outputFields.map(fieldToManifest),
  };
  if (op.description) entry.description = op.description;
  if (op.isDestructive) entry.is_destructive = true;
  if (op.isWrite !== undefined) entry.is_write = op.isWrite;
  return entry;
}

// ─── Health Check ────────────────────────────────────────────────────────────

/**
 * Result of a connector health check.
 */
export interface HealthCheckResult {
  healthy: boolean;
  provider: string;
  message?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

// ─── Connector Manifest ──────────────────────────────────────────────────────

/**
 * Manifest entry for a single connector (matches the Python-generated format).
 */
export interface ConnectorManifestOperation {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type?: string;
  }>;
}

export interface ConnectorManifestEntry {
  operations: ConnectorManifestOperation[];
  operation_count: number;
}

export interface ConnectorManifest {
  version: string;
  generated_at: string;
  connector_count: number;
  connectors: Record<string, ConnectorManifestEntry>;
}

// ─── Connector Config ────────────────────────────────────────────────────────

/**
 * Configuration for a connector package.
 */
export interface ConnectorConfig {
  /** Provider slug (e.g. "gmail", "slack") */
  provider: string;
  /** Human-readable name */
  displayName: string;
  /** Connector description */
  description?: string;
  /** Authentication type */
  authType: AuthType;
  /** Base URL for the API */
  baseUrl?: string;
  /** Default HTTP headers */
  defaultHeaders?: Record<string, string>;
  /** Operation schemas */
  operations: OperationSchema[];
}
