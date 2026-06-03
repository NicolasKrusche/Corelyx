/**
 * Connector tier gates.
 *
 * PAY_PER_USE_PROVIDERS  – connectors where usage is billed to the user's own
 *                          external account (Stripe, Twilio, OpenAI, etc.).
 *                          Connecting them requires Solo plan or higher so that
 *                          BYOK is available and the user acknowledges their own
 *                          account is being used.
 *
 * API_KEY_ONLY_PROVIDERS  – subset of the above that have no meaningful OAuth
 *                          flow; they are always connected via an API key.
 */

export const PAY_PER_USE_PROVIDERS = new Set([
  // ── Payments ──────────────────────────────────────────────────────────────
  "stripe", "paypal", "square", "braintree", "adyen",
  "chargebee", "recurly", "gocardless", "mollie", "paddle", "lemonsqueezy",
  // ── Telephony / Comms ─────────────────────────────────────────────────────
  "twilio", "vonage", "telnyx", "ringcentral", "openphone", "aircall", "dialpad",
  // ── Transactional email ───────────────────────────────────────────────────
  "sendgrid", "postmark", "resend",
  // ── AI / ML ───────────────────────────────────────────────────────────────
  "openai", "replicate", "cohere", "pinecone",
  // ── Storage / Media ───────────────────────────────────────────────────────
  "awss3", "cloudinary", "mux", "wistia",
  // ── Data / Intelligence ───────────────────────────────────────────────────
  "clearbit", "zoominfo", "lusha", "hunter", "apollo", "semrush", "ahrefs",
  // ── Messaging (per-message billing) ──────────────────────────────────────
  "whatsapp",
]);

/**
 * Providers that have no standard OAuth2 redirect flow.
 * The UI shows an API key dialog for these; the catch-all OAuth route
 * redirects them back to the connections page with connect_api_key.
 */
export const API_KEY_ONLY_PROVIDERS = new Set([
  // AI / ML
  "openai", "replicate", "cohere", "pinecone",
  // Transactional email
  "twilio", "vonage", "telnyx", "sendgrid", "postmark", "resend", "openphone",
  // Storage / Media
  "awss3", "cloudinary", "mux", "wistia",
  // Payments (no user-facing OAuth)
  "adyen", "braintree", "chargebee", "recurly", "mollie", "lemonsqueezy",
  // Intelligence
  "clearbit", "zoominfo", "lusha", "hunter", "apollo", "semrush", "ahrefs",
]);
