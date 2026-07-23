/**
 * @flowos/connector-sdk — Schema Helpers
 *
 * Zod-based schema definition helpers for connector operations.
 * Provides a fluent API for defining input/output fields that generates
 * both Zod validators and connector manifest-compatible JSON.
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  type FieldSchema,
  type OperationSchema,
  type ConnectorConfig,
  FieldKind,
  FieldSchemaSchema,
  OperationSchemaSchema,
  fieldToManifest,
  operationToManifest,
} from "./types.js";

// ─── Field Builder ───────────────────────────────────────────────────────────

/**
 * Fluent builder for defining a connector operation field.
 *
 * @example
 * ```ts
 * const queryField = field("query")
 *   .kind(FieldKind.STRING)
 *   .required()
 *   .description("Gmail search query");
 *
 * const limitField = field("max_results")
 *   .kind(FieldKind.INTEGER)
 *   .default(10);
 * ```
 */
export class FieldBuilder {
  private _name: string;
  private _kind: FieldKind = FieldKind.STRING;
  private _required: boolean = false;
  private _description: string = "";
  private _default: unknown = undefined;
  private _enum: string[] | undefined;

  constructor(name: string) {
    this._name = name;
  }

  kind(k: FieldKind): this {
    this._kind = k;
    return this;
  }

  required(): this {
    this._required = true;
    return this;
  }

  description(d: string): this {
    this._description = d;
    return this;
  }

  default(v: unknown): this {
    this._default = v;
    return this;
  }

  enum(values: string[]): this {
    this._enum = values;
    return this;
  }

  build(): FieldSchema {
    return {
      name: this._name,
      kind: this._kind,
      required: this._required,
      description: this._description,
      default: this._default,
      enum: this._enum,
    };
  }
}

/**
 * Create a new field builder.
 */
export function field(name: string): FieldBuilder {
  return new FieldBuilder(name);
}

// ─── Operation Builder ───────────────────────────────────────────────────────

/**
 * Fluent builder for defining a connector operation.
 *
 * @example
 * ```ts
 * const listOp = operation("list_emails")
 *   .description("List emails matching a query")
 *   .input(
 *     field("query").kind(FieldKind.STRING).description("Search query"),
 *     field("max_results").kind(FieldKind.INTEGER).default(10),
 *   )
 *   .output(
 *     field("emails").kind(FieldKind.ARRAY),
 *     field("next_page_token").kind(FieldKind.STRING),
 *   );
 * ```
 */
export class OperationBuilder {
  private _name: string;
  private _description: string = "";
  private _inputFields: FieldSchema[] = [];
  private _outputFields: FieldSchema[] = [];
  private _isDestructive: boolean = false;
  private _isWrite: boolean | undefined;

  constructor(name: string) {
    this._name = name;
  }

  description(d: string): this {
    this._description = d;
    return this;
  }

  input(...fields: (FieldSchema | FieldBuilder)[]): this {
    for (const f of fields) {
      this._inputFields.push(f instanceof FieldBuilder ? f.build() : f);
    }
    return this;
  }

  output(...fields: (FieldSchema | FieldBuilder)[]): this {
    for (const f of fields) {
      this._outputFields.push(f instanceof FieldBuilder ? f.build() : f);
    }
    return this;
  }

  destructive(): this {
    this._isDestructive = true;
    return this;
  }

  write(isWrite: boolean = true): this {
    this._isWrite = isWrite;
    return this;
  }

  build(): OperationSchema {
    return {
      name: this._name,
      description: this._description,
      inputFields: this._inputFields,
      outputFields: this._outputFields,
      isDestructive: this._isDestructive,
      isWrite: this._isWrite,
    };
  }
}

/**
 * Create a new operation builder.
 */
export function operation(name: string): OperationBuilder {
  return new OperationBuilder(name);
}

// ─── Connector Builder ───────────────────────────────────────────────────────

/**
 * Fluent builder for defining a complete connector.
 *
 * @example
 * ```ts
 * const myConnector = connector("myapi")
 *   .displayName("My API")
 *   .description("Connector for My API")
 *   .authType(AuthType.API_KEY)
 *   .baseUrl("https://api.myapi.com/v1")
 *   .operations(
 *     operation("list_items")
 *       .description("List all items")
 *       .input(field("limit").kind(FieldKind.INTEGER).default(10))
 *       .output(field("items").kind(FieldKind.ARRAY)),
 *   )
 *   .build();
 * ```
 */
export class ConnectorBuilder {
  private _config: Partial<ConnectorConfig> = {
    operations: [],
  };

  constructor(provider: string) {
    this._config.provider = provider;
  }

  displayName(name: string): this {
    this._config.displayName = name;
    return this;
  }

  description(d: string): this {
    this._config.description = d;
    return this;
  }

  authType(auth: AuthType): this {
    this._config.authType = auth;
    return this;
  }

  baseUrl(url: string): this {
    this._config.baseUrl = url;
    return this;
  }

  defaultHeaders(headers: Record<string, string>): this {
    this._config.defaultHeaders = headers;
    return this;
  }

  operations(...ops: (OperationSchema | OperationBuilder)[]): this {
    for (const op of ops) {
      this._config.operations!.push(op instanceof OperationBuilder ? op.build() : op);
    }
    return this;
  }

  build(): ConnectorConfig {
    if (!this._config.provider) throw new Error("Connector provider is required");
    if (!this._config.displayName) throw new Error("Connector displayName is required");
    if (!this._config.authType) throw new Error("Connector authType is required");
    return this._config as ConnectorConfig;
  }
}

/**
 * Create a new connector builder.
 */
export function connector(provider: string): ConnectorBuilder {
  return new ConnectorBuilder(provider);
}

// ─── Zod Schema Generation ───────────────────────────────────────────────────

/**
 * Generate a Zod schema from a FieldSchema definition.
 */
export function fieldToZod(field: FieldSchema): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (field.kind) {
    case FieldKind.STRING:
      schema = z.string();
      break;
    case FieldKind.INTEGER:
      schema = z.number().int();
      break;
    case FieldKind.FLOAT:
      schema = z.number();
      break;
    case FieldKind.BOOLEAN:
      schema = z.boolean();
      break;
    case FieldKind.OBJECT:
      schema = z.record(z.string(), z.unknown());
      break;
    case FieldKind.ARRAY:
      schema = z.array(z.unknown());
      break;
    case FieldKind.FILE:
      schema = z.string(); // base64-encoded or URL
      break;
    default:
      schema = z.unknown();
  }

  if (field.enum) {
    schema = z.enum(field.enum as [string, ...string[]]);
  }

  if (field.default !== undefined) {
    schema = schema.default(field.default as never);
  }

  if (!field.required) {
    schema = schema.optional();
  }

  return schema;
}

/**
 * Generate a Zod input schema from an OperationSchema.
 * Returns a Zod object that can validate operation input parameters.
 */
export function operationInputSchema(op: OperationSchema): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of op.inputFields) {
    shape[field.name] = fieldToZod(field);
  }

  return z.object(shape);
}

/**
 * Generate a Zod output schema from an OperationSchema.
 * Returns a Zod object that can validate operation output.
 */
export function operationOutputSchema(op: OperationSchema): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of op.outputFields) {
    shape[field.name] = fieldToZod(field);
  }

  return z.object(shape);
}

// ─── JSON Schema Generation ──────────────────────────────────────────────────

/**
 * Convert a Zod schema to JSON Schema.
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(schema, { target: "openApi3_1" }) as Record<string, unknown>;
}

// ─── Manifest Generation ─────────────────────────────────────────────────────

/**
 * Convert a ConnectorConfig to the manifest JSON format.
 * This produces the same format as apps/runtime/scripts/generate_connector_manifest.py.
 */
export function connectorToManifestJson(config: ConnectorConfig): Record<string, unknown> {
  return {
    provider: config.provider,
    display_name: config.displayName,
    description: config.description ?? "",
    auth_type: config.authType,
    base_url: config.baseUrl ?? "",
    operations: config.operations.map(operationToManifest),
    operation_count: config.operations.length,
  };
}

/**
 * Generate a full manifest file from multiple connector configs.
 */
export function generateManifest(configs: ConnectorConfig[]): Record<string, unknown> {
  const connectors: Record<string, unknown> = {};

  for (const config of configs) {
    connectors[config.provider] = connectorToManifestJson(config);
  }

  return {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    connector_count: configs.length,
    connectors,
  };
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export {
  FieldSchemaSchema,
  OperationSchemaSchema,
  fieldToManifest,
  operationToManifest,
} from "./types.js";
