/**
 * @flowos/connector-sdk
 *
 * SDK for building Corelyx connectors.
 *
 * @example
 * ```ts
 * import {
 *   BaseConnector,
 *   AuthType,
 *   FieldKind,
 *   field,
 *   operation,
 *   createHandler,
 *   type OperationContext,
 * } from "@flowos/connector-sdk";
 *
 * class MyConnector extends BaseConnector {
 *   provider = "myapi";
 *   displayName = "My API";
 *   baseUrl = "https://api.myapi.com/v1";
 *   authType = AuthType.BEARER;
 *
 *   protected setupHandlers(): void {
 *     this.handlers.register(
 *       createHandler(
 *         {
 *           name: "list_items",
 *           description: "List all items",
 *           inputFields: [
 *             field("limit").kind(FieldKind.INTEGER).default(10).build(),
 *           ],
 *           outputFields: [
 *             field("items").kind(FieldKind.ARRAY).build(),
 *           ],
 *         },
 *         async (ctx) => {
 *           const response = await fetch(
 *             `${ctx.baseUrl}/items?limit=${ctx.params.limit}`,
 *             ctx.auth.apply({ method: "GET" })
 *           );
 *           const data = await response.json();
 *           return { data: { items: data.items } };
 *         }
 *       )
 *     );
 *   }
 * }
 *
 * export default new MyConnector();
 * ```
 *
 * @packageDocumentation
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export {
  AuthType,
  FieldKind,
  type FieldSchema,
  type OperationSchema,
  type HealthCheckResult,
  type ConnectorManifest,
  type ConnectorManifestEntry,
  type ConnectorManifestOperation,
  type ConnectorConfig,
  FieldSchemaSchema,
  OperationSchemaSchema,
  fieldToManifest,
  operationToManifest,
} from "./types.js";

// ─── Schema Helpers ──────────────────────────────────────────────────────────

export {
  FieldBuilder,
  OperationBuilder,
  ConnectorBuilder,
  field,
  operation,
  connector,
  fieldToZod,
  operationInputSchema,
  operationOutputSchema,
  toJsonSchema,
  connectorToManifestJson,
  generateManifest,
} from "./schema.js";

// ─── Auth Providers ──────────────────────────────────────────────────────────

export {
  type AuthProvider,
  type OAuth2Config,
  type ApiKeyConfig,
  OAuth2Provider,
  ApiKeyProvider,
  BearerProvider,
  BasicAuthProvider,
  NoAuthProvider,
  createAuthProvider,
  OAuth2ConfigSchema,
  ApiKeyConfigSchema,
  BearerConfigSchema,
  BasicConfigSchema,
} from "./auth.js";

// ─── Operations ──────────────────────────────────────────────────────────────

export {
  type OperationContext,
  type OperationResult,
  type OperationHandler,
  HandlerRegistry,
  createHandler,
  BaseConnector,
} from "./operations.js";

// ─── Manifest Generator ──────────────────────────────────────────────────────

export {
  type ManifestGeneratorOptions,
  generateConnectorManifest,
  writeManifest,
  readManifest,
  mergeManifests,
} from "./manifest.js";
