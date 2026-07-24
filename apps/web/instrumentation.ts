/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Used to initialise Sentry on the server side and register any
 * global error handlers.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Sentry server-side init is handled by sentry.server.config.ts
    // This hook ensures the config is loaded at startup.
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Sentry edge-side init is handled by sentry.edge.config.ts
    await import("./sentry.edge.config");
  }
}
