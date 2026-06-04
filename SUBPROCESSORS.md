# Corelyx — Subprocessors

**Last reviewed:** 2026-05-27
**Notification commitment:** Customers are notified at least **30 days** before a new subprocessor begins processing personal data, in line with our DPA.

This document lists the third-party services that may process personal data on Corelyx's behalf. The authoritative, always-current version is rendered from the code-backed provider registry at **[/subprocessors](https://www.corelyx.app/subprocessors)** and **[/data-residency](https://www.corelyx.app/data-residency)**; this file mirrors it for reference and must be kept in sync with `apps/web/lib/compliance/provider-registry.ts`.

To be notified of changes, contact [legal@corelyx.app](mailto:legal@corelyx.app).

---

## Active subprocessors

| Service | Provider | Purpose | Hosting region | Used by default | Transfer basis / status |
|---|---|---|---|---|---|
| Supabase | Supabase Inc. | Postgres database, authentication, Vault-backed secret references | EU region (eu-central-1, Frankfurt) for Corelyx production | Yes (always) | DPA + SCCs where any subprocessor involves third-country processing. **Approved.** |
| Vercel | Vercel Inc. | Web app hosting (frontend + API routes) | EU regions (Frankfurt / Dublin); static assets via global CDN, no personal data cached at edge | Yes (always) | DPA + transfer addendum. EU-configured. |
| Railway | Railway Corp. | Python workflow runtime hosting | EU West (Amsterdam) | Yes (always) | DPA + SCCs where applicable. |
| Inngest | Inngest Inc. | Scheduling, retries, event dispatch, async orchestration | Provider-managed | Yes (always) | DPA + SCCs. Event metadata only — not full payloads; treat as third-country transfer risk until region confirmed. |
| Resend | Resend Inc. | Transactional email (approvals, failures, account, billing notices) | United States (account data, email metadata, logs) | No — only when transactional email is sent | DPA + SCCs required for EEA personal data. No workflow content sent — addresses and transactional subject lines only. |
| Stripe | Stripe Payments Europe Ltd. | Checkout, subscriptions, invoicing, payment processing, fraud prevention | Provider-managed global financial infrastructure | No — only when billing features are used | DPA, SCCs, and payment-law processing roles. No card data stored by Corelyx (tokenized by Stripe). |
| OpenRouter | OpenRouter, Inc. | **LLM routing used by the Corelyx platform key to execute Genesis and agent nodes.** Also used if a customer configures their own OpenRouter key. | Provider-managed global routing (EU routing only on enterprise accounts) | **Yes — active whenever the Corelyx platform key is used** | **No countersigned DPA or SCCs currently in place.** Corelyx is pursuing an enterprise DPA. Until then, treat as a third-country transfer risk and do **not** route special-category personal data through the platform key. OpenRouter states prompts are not used for training or retained beyond request processing by default — verify at openrouter.ai/privacy. |
| OpenAI | OpenAI OpCo LLC | Optional LLM inference for agent nodes / model ops | US by default; EU residency only for eligible configured API projects | No — only when selected or a customer key is configured | DPA + SCCs unless an eligible EU-resident project is verified. |
| Anthropic | Anthropic PBC | Optional LLM inference for agent nodes | US for customer data unless otherwise agreed | No — only when selected or a customer key is configured | DPA + SCCs required for EEA personal data. Anthropic states API data is not used for training by default and is normally deleted within 30 days. |
| Google | Google LLC | Google Sign-In (OAuth) for all users; optionally Gmail/Calendar/Docs/Drive/Sheets workflow actions when explicitly connected | Provider-managed; depends on Google account / Workspace region | Sign-In: yes. Connectors: only if connected | Google terms, DPA, SCCs, customer tenant controls. |

**Note on AI processing:** Corelyx provides a **platform model key (routed via OpenRouter)** so users can run Genesis and agent nodes without bringing their own key. This is **not** "BYOK-only" — when the platform key is used, customer prompt data is processed by OpenRouter under Corelyx's account. Customers who need a signed DPA / EU residency for AI processing should configure their own EU-eligible provider key (e.g. Anthropic, OpenAI EU project, or EU-hosted Mistral) and/or enable **EU-only workspace mode**, which blocks unresolved-risk providers before a run executes.

Structured-identifier redaction (email addresses, phone numbers, IBANs, IP addresses, payment card numbers, and secrets) is applied to prompts before they leave Corelyx infrastructure. Free-text prose, including names, is **not** removed.

---

## Connected third-party APIs (customer-controlled)

When a customer authorizes Corelyx to access an account on Gmail, Notion, Slack, GitHub, Google Sheets / Drive / Calendar / Docs, Airtable, HubSpot, Asana, Typeform, Outlook, GitLab, Jira, Confluence, Dropbox, Shopify, Zoom, Sentry, Todoist, Calendly, or any HTTP endpoint, the customer's workflows transfer data to those services.

These are **not subprocessors of Corelyx** under GDPR — the customer is the controller and chose the integration — but are listed for transparency. Customers can revoke access at any time from Connections settings; revocation purges the OAuth secret from Supabase Vault and the credential row from the database.

Customer-configured **HTTP endpoints** have no DPA/SCC coverage by default; the customer must document the recipient, transfer basis, and safeguards before routing personal data to them.

---

## Change history

| Date | Change |
|---|---|
| 2026-05-27 | Rewritten to match the code-backed provider registry: corrected the AI processing description (platform key routes through OpenRouter by default — not BYOK-only), removed an unbuilt internal router entry, and added newly supported connectors. |
| 2026-04-28 | Initial publication. |

---

## Contact

For DPA requests or subprocessor change notifications: [legal@corelyx.app](mailto:legal@corelyx.app)
