/**
 * Connector tier policy.
 *
 * The rule, stated plainly so the next change to this file stays coherent:
 *
 *   Connecting a provider with the user's OWN credentials costs Corelyx nothing
 *   beyond the HTTP call the run makes — and runs are already metered by the
 *   per-plan run limit (see entitlements.runsPerMonth). So connector access is
 *   NOT gated by plan. Gating it only cost us the funnel: a free user couldn't
 *   evaluate the product against the tools they actually use.
 *
 * The one exception is AI inference. Those connectors can generate completions,
 * which makes them a back door around the BYOK-LLM entitlement: the LLM node
 * refuses a non-platform key on the Free plan (see runtime executor
 * `_enforce_agent_model_access`, which raises BYOK_PLAN_REQUIRED), so letting
 * Free users call OpenAI through a *connector* would contradict a gate we
 * deliberately enforce two other places. Those stay on the same entitlement as
 * BYOK itself (`entitlements.byok`) so all three agree.
 *
 * PAY_PER_USE_PROVIDERS  – LABEL ONLY, no longer a gate. Providers that bill the
 *                          user's own external account per use (Stripe, Twilio,
 *                          AWS). Surfaced in the UI so connecting one is an
 *                          informed choice, not a surprise on their next invoice.
 *
 * AI_INFERENCE_PROVIDERS – the actual gate. Requires the BYOK entitlement
 *                          (Solo+), for the reason above.
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
 * Connectors that can run model inference with a user-supplied key.
 *
 * Membership is decided by the connector's operations, not its vendor: pinecone
 * is an AI-adjacent vendor but only exposes query_index/upsert_vectors (vector
 * storage, no generation), so it is deliberately absent and stays ungated.
 * Check `supported_operations` in apps/runtime/connectors/<provider>.py before
 * adding or removing anything here.
 */
export const AI_INFERENCE_PROVIDERS = new Set([
  "openai",     // create_completion, create_embedding
  "cohere",     // generate_text, embed_text
  "replicate",  // run_model
]);

/** True when connecting/using this provider requires the BYOK entitlement (Solo+). */
export function connectorRequiresPaidPlan(provider: string): boolean {
  return AI_INFERENCE_PROVIDERS.has(provider.trim());
}

/** True when usage bills the user's own external account — a UI label, not a gate. */
export function connectorBillsExternally(provider: string): boolean {
  return PAY_PER_USE_PROVIDERS.has(provider.trim());
}
