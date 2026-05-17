# Corelyx — Subprocessors

**Last updated:** 2026-04-28
**Notification commitment:** Customers will be notified at least **30 days** before a new subprocessor begins processing personal data, in line with our DPA.

This page lists every third-party service that processes personal data on Corelyx's behalf. It is the source of truth referenced from our Data Processing Agreement (DPA, GDPR Art. 28).

If you are a customer and want to be notified of changes, subscribe at [legal@corelyx.app](mailto:legal@corelyx.app).

---

## Active subprocessors
b
| Service | Provider | Purpose | Data processed | Hosting region | Cross-border transfer mechanism |
|---|---|---|---|---|---|
| Supabase | Supabase Inc. | Postgres database, auth, Vault for secrets | User accounts, workflow definitions, execution logs (metadata-only by default), encrypted OAuth tokens, encrypted API keys | EU (region pinned) | Subprocessor agreement; data residency confirmed in EU region. |
| Vercel | Vercel Inc. | Web app hosting (frontend + API routes) | Account data in transit, request logs (no payloads stored), access logs | EU edge regions | Standard Contractual Clauses (SCC). |
| Railway | Railway Corp. | Workflow runtime hosting (Python / LangGraph) | Workflow execution payloads in transit and during execution | EU region | SCC. |
| Anthropic | Anthropic PBC | LLM API for Genesis + agent nodes (BYOK — only used if the customer's own Anthropic key is selected) | Sanitized workflow descriptions and sanitized agent inputs | US | DPA + SCC required before BYOK use. PII sanitization applied client-side before transfer. |
| OpenAI | OpenAI OpCo LLC | LLM API for Genesis + agent nodes (BYOK) | Sanitized workflow descriptions and sanitized agent inputs | US | DPA + SCC required before BYOK use. PII sanitization applied. |
| Google (Gemini) | Google LLC | LLM API (BYOK) | Sanitized prompts | US | DPA + SCC required. PII sanitization applied. |
| Mistral AI | Mistral AI | LLM API (BYOK) | Sanitized prompts | EU (FR) — preferred for EU-only deployments | EU-to-EU. No SCC required. |
| Groq | Groq Inc. | LLM API (BYOK) | Sanitized prompts | US | DPA + SCC required. PII sanitization applied. |
| OpenRouter | OpenRouter Inc. | LLM API gateway (BYOK) | Sanitized prompts | US (proxies to underlying provider) | DPA + SCC required. PII sanitization applied. |
| Stripe | Stripe Payments Europe Ltd. | Payment processing, billing | Billing email, customer ID, payment method metadata (no card data — tokenized by Stripe) | EU + US (Stripe is the controller for payment data per their terms) | SCC for any incidental US transfer. |
| Inngest | Inngest Inc. | Trigger and scheduled-job orchestration | Trigger metadata, run identifiers (no payloads) | EU region | SCC. |
| LiteLLM (self-hosted) | Operated by Corelyx on Railway (EU) | Internal LLM router (planned) | Sanitized prompts in transit | EU only | None — fully EU. |

---

## Connected third-party APIs (customer-controlled)

When a customer authorizes Corelyx to access their account on Gmail, Notion, Slack, GitHub, Google Sheets / Drive / Calendar / Docs, Airtable, HubSpot, Asana, Typeform, Outlook, etc., the customer's workflows transfer data to those services. Corelyx is the data processor that initiates these calls on the customer's behalf.

These are **not subprocessors of Corelyx** under GDPR (the customer is the controller and chose the integration), but they are listed here for transparency:

| Provider | Operations exposed | Auth |
|---|---|---|
| Google (Gmail, Drive, Docs, Sheets, Calendar) | List / read / send / write / search per the connector op spec | OAuth 2.0 (token stored encrypted in Vault) |
| Microsoft (Outlook) | List / read / send / move emails | OAuth 2.0 |
| Slack | Messages, channels, reactions | OAuth 2.0 |
| GitHub | Issues, PRs, file pushes | OAuth 2.0 |
| Notion | Pages, databases, blocks | OAuth 2.0 |
| Airtable, HubSpot, Asana, Typeform | Records, deals, tasks, responses | OAuth 2.0 |

Customers can revoke access at any time from the Connections settings. Token revocation purges the OAuth secret from Supabase Vault and the credential row from the database.

---

## Change history

| Date | Change |
|---|---|
| 2026-04-28 | Initial publication. |

---

## Contact

For DPA requests or subprocessor change notifications: [legal@corelyx.app](mailto:legal@corelyx.app)
test22sasdadlllllasdlllasd