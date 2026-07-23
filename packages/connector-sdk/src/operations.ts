/**
 * @flowos/connector-sdk — Operations
 *
 * Operation handler interfaces and helpers for connector implementations.
 * Provides a typed, async handler pattern that maps operation names to implementations.
 */

import { type OperationSchema, type HealthCheckResult, type AuthType, FieldKind } from "./types.js";
import { type AuthProvider } from "./auth.js";
import { operationInputSchema, operationOutputSchema } from "./schema.js";
import { z } from "zod";

// ─── Operation Context ───────────────────────────────────────────────────────

/**
 * Context passed to every operation handler.
 * Contains the auth provider, operation parameters, and helper utilities.
 */
export interface OperationContext<TParams = Record<string, unknown>> {
  /** The operation name being executed */
  operation: string;
  /** Validated operation parameters */
  params: TParams;
  /** Auth provider for making authenticated requests */
  auth: AuthProvider;
  /** Base URL for the connector's API */
  baseUrl: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Result of an operation execution.
 * The data is merged into the run state for downstream nodes.
 */
export interface OperationResult<TData = Record<string, unknown>> {
  data: TData;
  /** Optional metadata about the execution */
  metadata?: {
    /** HTTP status code from the upstream API */
    statusCode?: number;
    /** Request latency in milliseconds */
    latencyMs?: number;
    /** Any warnings to surface */
    warnings?: string[];
  };
}

// ─── Operation Handler Interface ─────────────────────────────────────────────

/**
 * Interface that all operation handlers must implement.
 *
 * @example
 * ```ts
 * class ListEmailsHandler implements OperationHandler {
 *   schema: OperationSchema = {
 *     name: "list_emails",
 *     inputFields: [
 *       { name: "query", kind: FieldKind.STRING },
 *       { name: "max_results", kind: FieldKind.INTEGER, default: 10 },
 *     ],
 *     outputFields: [
 *       { name: "emails", kind: FieldKind.ARRAY },
 *       { name: "next_page_token", kind: FieldKind.STRING },
 *     ],
 *   };
 *
 *   async execute(ctx: OperationContext): Promise<OperationResult> {
 *     const { query, max_results } = ctx.params;
 *     const response = await fetch(
 *       `${ctx.baseUrl}/messages?q=${query}&maxResults=${max_results}`,
 *       ctx.auth.apply({ method: "GET" })
 *     );
 *     const data = await response.json();
 *     return { data: { emails: data.messages, next_page_token: data.nextPageToken } };
 *   }
 * }
 * ```
 */
export interface OperationHandler<TParams = Record<string, unknown>, TData = Record<string, unknown>> {
  /** Schema definition for this operation */
  schema: OperationSchema;

  /** Execute the operation */
  execute(ctx: OperationContext<TParams>): Promise<OperationResult<TData>>;
}

// ─── Handler Registry ────────────────────────────────────────────────────────

/**
 * Registry that maps operation names to their handler implementations.
 */
export class HandlerRegistry {
  private handlers = new Map<string, OperationHandler>();

  /**
   * Register an operation handler.
   */
  register(handler: OperationHandler): void {
    const name = handler.schema.name;
    if (this.handlers.has(name)) {
      throw new Error(`Handler already registered for operation: ${name}`);
    }
    this.handlers.set(name, handler);
  }

  /**
   * Register multiple handlers at once.
   */
  registerAll(handlers: OperationHandler[]): void {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  /**
   * Get a handler by operation name.
   */
  get(operation: string): OperationHandler | undefined {
    return this.handlers.get(operation);
  }

  /**
   * Get all registered operation names.
   */
  getOperations(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get all registered schemas.
   */
  getSchemas(): OperationSchema[] {
    return Array.from(this.handlers.values()).map((h) => h.schema);
  }

  /**
   * Validate parameters for an operation using its Zod schema.
   * Returns the parsed/validated params or throws a ZodError.
   */
  validateParams(operation: string, params: Record<string, unknown>): Record<string, unknown> {
    const handler = this.handlers.get(operation);
    if (!handler) {
      throw new Error(`No handler registered for operation: ${operation}`);
    }
    const inputSchema = operationInputSchema(handler.schema);
    return inputSchema.parse(params);
  }

  /**
   * Safely validate parameters, returning a result object.
   */
  safeValidateParams(
    operation: string,
    params: Record<string, unknown>
  ): { success: true; data: Record<string, unknown> } | { success: false; error: z.ZodError } {
    const handler = this.handlers.get(operation);
    if (!handler) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: "custom",
            message: `No handler registered for operation: ${operation}`,
            path: [],
          },
        ]),
      };
    }
    const inputSchema = operationInputSchema(handler.schema);
    const result = inputSchema.safeParse(params);
    return result as { success: true; data: Record<string, unknown> } | { success: false; error: z.ZodError };
  }
}

// ─── Simple Handler Helper ───────────────────────────────────────────────────

/**
 * Create a simple operation handler from a schema and execute function.
 *
 * @example
 * ```ts
 * const handler = createHandler(
 *   {
 *     name: "list_items",
 *     inputFields: [
 *       { name: "limit", kind: FieldKind.INTEGER, default: 10 },
 *     ],
 *     outputFields: [
 *       { name: "items", kind: FieldKind.ARRAY },
 *     ],
 *   },
 *   async (ctx) => {
 *     const response = await fetch(
 *       `${ctx.baseUrl}/items?limit=${ctx.params.limit}`,
 *       ctx.auth.apply({ method: "GET" })
 *     );
 *     const data = await response.json();
 *     return { data: { items: data.items } };
 *   }
 * );
 * ```
 */
export function createHandler<TParams = Record<string, unknown>, TData = Record<string, unknown>>(
  schema: OperationSchema,
  executeFn: (ctx: OperationContext<TParams>) => Promise<OperationResult<TData>>
): OperationHandler<TParams, TData> {
  return {
    schema,
    execute: executeFn,
  };
}

// ─── Connector Base Class ────────────────────────────────────────────────────

/**
 * Base class for building connectors using the handler registry pattern.
 *
 * @example
 * ```ts
 * class GmailConnector extends BaseConnector {
 *   provider = "gmail";
 *   displayName = "Gmail";
 *   baseUrl = "https://gmail.googleapis.com/gmail/v1/users/me";
 *   authType = AuthType.OAUTH2;
 *
 *   protected setupHandlers(): void {
 *     this.handlers.register(
 *       createHandler(
 *         {
 *           name: "list_emails",
 *           inputFields: [
 *             { name: "query", kind: FieldKind.STRING },
 *             { name: "max_results", kind: FieldKind.INTEGER, default: 10 },
 *           ],
 *           outputFields: [
 *             { name: "emails", kind: FieldKind.ARRAY },
 *           ],
 *         },
 *         async (ctx) => {
 *           // Implementation
 *           return { data: { emails: [] } };
 *         }
 *       )
 *     );
 *   }
 * }
 * ```
 */
export abstract class BaseConnector {
  /** Provider slug (e.g. "gmail") */
  abstract provider: string;

  /** Human-readable display name */
  abstract displayName: string;

  /** Base URL for the API */
  abstract baseUrl: string;

  /** Authentication type */
  abstract authType: AuthType;

  /** Optional default headers */
  defaultHeaders?: Record<string, string>;

  /** Operation handler registry */
  protected handlers = new HandlerRegistry();

  constructor() {
    this.setupHandlers();
  }

  /**
   * Subclasses must override this to register operation handlers.
   */
  protected abstract setupHandlers(): void;

  /**
   * Get all supported operation names.
   */
  get supportedOperations(): string[] {
    return this.handlers.getOperations();
  }

  /**
   * Get all operation schemas.
   */
  get operationSchemas(): OperationSchema[] {
    return this.handlers.getSchemas();
  }

  /**
   * Execute an operation by name.
   */
  async execute(
    operation: string,
    params: Record<string, unknown>,
    auth: AuthProvider,
    options?: { signal?: AbortSignal }
  ): Promise<OperationResult> {
    const handler = this.handlers.get(operation);
    if (!handler) {
      throw new Error(
        `Unsupported operation: ${operation}. ` +
        `Supported: ${this.supportedOperations.join(", ")}`
      );
    }

    // Validate params
    const validatedParams = this.handlers.validateParams(operation, params);

    return handler.execute({
      operation,
      params: validatedParams,
      auth,
      baseUrl: this.baseUrl,
      signal: options?.signal,
    });
  }

  /**
   * Health check for the connector's upstream API.
   * Default implementation does a lightweight GET to the base URL.
   */
  async healthCheck(auth?: AuthProvider): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const init: RequestInit = { method: "GET" };
      const modifiedInit = auth ? auth.apply(init) : init;
      const response = await fetch(this.baseUrl, {
        ...modifiedInit,
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - start;
      return {
        healthy: response.status < 500,
        provider: this.provider,
        message: `HTTP ${response.status}`,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      return {
        healthy: false,
        provider: this.provider,
        message: error instanceof Error ? error.message : String(error),
        latencyMs,
      };
    }
  }

  /**
   * Return a summary dict useful for logging, debugging, or API responses.
   */
  info(): Record<string, unknown> {
    return {
      provider: this.provider,
      displayName: this.displayName,
      className: this.constructor.name,
      operations: this.supportedOperations,
      baseUrl: this.baseUrl,
      authType: this.authType,
      schemaCount: this.operationSchemas.length,
    };
  }
}
