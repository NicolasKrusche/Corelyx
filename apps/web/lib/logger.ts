/**
 * Structured logging for the Corelyx web app via pino.
 *
 * Server-side API routes and middleware should import `getLogger` to get
 * a child logger with request context. The logger emits JSON in production
 * and pretty-printed output in development.
 *
 * Usage in an API route:
 * ```ts
 * import { getLogger } from "@/lib/logger";
 *
 * const log = getLogger("api.programs.runs");
 * log.info({ runId, programId }, "runs query started");
 * ```
 */

import pino from "pino";

const isDev = process.env.NODE_ENV === "development";
const level = process.env.LOG_LEVEL || (isDev ? "debug" : "info");

/**
 * Base pino instance. Configured once and reused across imports.
 * In production: JSON lines to stderr (Vercel captures these).
 * In development: pino-pretty for human-readable output.
 */
const baseLogger = pino(
  {
    level,
    // Redact sensitive fields from all log lines
    redact: {
      paths: [
        "password",
        "token",
        "secret",
        "apiKey",
        "api_key",
        "access_token",
        "accessToken",
        "authorization",
        "Authorization",
        "SUPABASE_SERVICE_ROLE_KEY",
        "STRIPE_SECRET_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
      ],
      censor: "[REDACTED]",
    },
    // Add base context fields
    base: {
      service: "corelyx-web",
      env: process.env.VERCEL_ENV || process.env.APP_ENV || "development",
    },
    // Timestamp formatting
    timestamp: pino.stdTimeFunctions.isoTime,
    // Serialize error objects with stack traces
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  },
  // Transport config: use pino-pretty in dev, stdout in prod
  isDev
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname",
        },
      })
    : undefined,
);

/**
 * Get a logger scoped to a module or component.
 *
 * @param module - Module name, e.g. "api.programs", "middleware"
 * @param context - Optional initial context fields
 * @returns A pino child logger
 */
export function getLogger(
  module: string,
  context?: Record<string, unknown>,
): pino.Logger {
  return baseLogger.child({ module, ...context });
}

/**
 * Create a request-scoped logger from incoming request metadata.
 * Useful in API route handlers.
 *
 * @param module - Module name
 * @param req - Request-like object with method, url, headers
 * @returns A pino child logger with request context
 */
export function getRequestLogger(
  module: string,
  req?: { method?: string; url?: string; headers?: Record<string, string | undefined> },
): pino.Logger {
  const ctx: Record<string, unknown> = {};
  if (req) {
    ctx.method = req.method;
    ctx.url = req.url;
    // Extract request ID from headers if present
    const requestId = req.headers?.["x-request-id"] || req.headers?.["x-nonce"];
    if (requestId) {
      ctx.requestId = requestId;
    }
  }
  return getLogger(module, ctx);
}

export default baseLogger;
