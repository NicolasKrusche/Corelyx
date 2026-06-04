// Canonical public URL helper for outbound webhook registration.
//
// Webhook senders — Google Pub/Sub (Gmail), Google Drive (Sheets), GitHub —
// do NOT follow HTTP redirects when delivering events. The apex domain
// (corelyx.app) is permanently 308-redirected to the canonical www host by the
// platform, so any webhook registered against the apex (or with a trailing
// slash, or over http) has every delivery dropped and retried forever — which
// floods the endpoint with 3XX edge requests instead of reaching the handler.
//
// Always build webhook URLs from the canonical origin: correct host, https, and
// no trailing slash. CANONICAL_WEBHOOK_HOST overrides the default for other
// environments; the apex of that host is rewritten to it automatically.

const CANONICAL_HOST = process.env.CANONICAL_WEBHOOK_HOST?.trim() || "www.corelyx.app";
const CANONICAL_APEX = CANONICAL_HOST.replace(/^www\./, "");

/**
 * Resolve the canonical origin (scheme + host, no path/trailing slash) to use
 * when advertising or registering webhook endpoints. Normalizes the apex host to
 * the canonical www host and forces https for non-local hosts. Localhost and any
 * unrelated host (previews, staging) pass through unchanged apart from origin
 * normalization.
 */
export function canonicalAppOrigin(rawUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  const fallback = `https://${CANONICAL_HOST}`;
  if (!rawUrl) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return fallback;
  }

  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  // Rewrite the redirecting apex to the canonical host so deliveries are not
  // bounced by the platform's apex→www redirect.
  if (parsed.hostname === CANONICAL_APEX) {
    parsed.hostname = CANONICAL_HOST;
  }

  // Never register an http endpoint for a real host — it would itself redirect.
  if (!isLocal && parsed.protocol !== "https:") {
    parsed.protocol = "https:";
  }

  // `origin` intentionally drops any path, query, or trailing slash.
  return parsed.origin;
}

/**
 * Build a fully-qualified webhook URL on the canonical origin for the given path
 * (e.g. "/api/webhooks/gmail").
 */
export function canonicalWebhookUrl(
  path: string,
  rawUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL
): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${canonicalAppOrigin(rawUrl)}${suffix}`;
}
