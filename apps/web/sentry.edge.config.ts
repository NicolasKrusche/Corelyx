import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: isDev ? 1.0 : 0.1,

  // Environment tags
  environment: process.env.VERCEL_ENV || process.env.APP_ENV || "development",

  // Only send in production-like environments
  enabled:
    !!process.env.SENTRY_DSN &&
    process.env.NODE_ENV !== "test",

  // Mask sensitive data before sending to Sentry
  beforeSend(event) {
    // Mask authorization headers
    if (event.request?.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (key.toLowerCase() === "authorization") {
          event.request.headers[key] = "[MASKED]";
        }
      }
    }

    // Mask sensitive data in exception values
    if (event.exception?.values) {
      for (const exc of event.exception.values) {
        if (exc.value) {
          exc.value = exc.value
            .replace(/Bearer\s+[^\s"]+/g, "Bearer [MASKED]")
            .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-[MASKED]")
            .replace(/key[=:]\s*["']?[^\s"']+/gi, "key=[MASKED]")
            .replace(
              /password[=:]\s*["']?[^\s"']+/gi,
              "password=[MASKED]",
            );
        }
      }
    }

    // Mask sensitive data in extra contexts
    const sensitiveKeys = [
      "password",
      "token",
      "secret",
      "api_key",
      "apiKey",
      "access_token",
      "accessToken",
      "SUPABASE_SERVICE_ROLE_KEY",
      "STRIPE_SECRET_KEY",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
    ];

    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        if (
          sensitiveKeys.some((sk) =>
            key.toLowerCase().includes(sk.toLowerCase()),
          )
        ) {
          event.extra[key] = "[MASKED]";
        }
      }
    }

    // Mask sensitive data in contexts
    if (event.contexts) {
      for (const ctxKey of Object.keys(event.contexts)) {
        const ctx = event.contexts[ctxKey];
        if (ctx && typeof ctx === "object") {
          for (const propKey of Object.keys(ctx)) {
            if (
              sensitiveKeys.some((sk) =>
                propKey.toLowerCase().includes(sk.toLowerCase()),
              )
            ) {
              (ctx as Record<string, unknown>)[propKey] = "[MASKED]";
            }
          }
        }
      }
    }

    return event;
  },

});

Sentry.setTags({ runtime: "nextjs-edge" });
