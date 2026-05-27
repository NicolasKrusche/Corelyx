# Corelyx — AI System Inventory

**Status:** Internal compliance document
**Last updated:** 2026-04-28
**Owner:** Founding team (DPO TBA)
**Related:** [docs/soa.md](docs/soa.md), [docs/risk-register.md](docs/risk-register.md)

This is the internal record required under the EU AI Act (active since 2 August 2025) for all AI systems Corelyx deploys. Every system that calls a General-Purpose AI model is listed here. Update this file whenever a new model, provider, or use case is introduced.

---

## System 1 — Workflow Graph Generator (Genesis)

| Field | Value |
|---|---|
| Internal name | Genesis |
| Source code | [apps/web/app/api/genesis/route.ts](apps/web/app/api/genesis/route.ts), [apps/web/app/api/genesis/stream/route.ts](apps/web/app/api/genesis/stream/route.ts), [apps/web/lib/genesis/](apps/web/lib/genesis/) |
| Purpose | Convert plain-English workflow descriptions into structured FlowOS program schemas (JSON graphs of triggers, agents, steps, connections). |
| Risk classification (AI Act) | Minimal risk. General-purpose tool. No automated decision-making with legal or similarly significant effect on individuals. Customers building Annex III high-risk workflows on top of Corelyx are themselves the deployers of that high-risk system. |
| Models used | Customer-provided (BYOK). Default candidates by provider: `claude-sonnet-4-6` (Anthropic), `gpt-4o` (OpenAI), `gemini-1.5-pro` (Google), `llama-3.3-70b-versatile` (Groq), `mistral-large-latest` (Mistral), `qwen/qwen3-coder:free` (OpenRouter). The user's API key is the one charged. |
| Provider(s) | Anthropic PBC (US), OpenAI OpCo LLC (US), Google LLC (US), Groq Inc. (US), Mistral AI (FR), OpenRouter (US) |
| Data sent to model | Sanitized user workflow description, sanitized refinement text, list of selected connection names + provider + scopes (no tokens), prior schema (sanitized) for refinements. |
| PII handling | Pre-call sanitization via [apps/web/lib/privacy/pii.ts](apps/web/lib/privacy/pii.ts) — emails, phones, IBANs, IPs, national IDs, credit cards, OAuth tokens, and prefixed secrets are redacted before any prompt leaves the EU API tier. PII redaction counts are logged for audit. |
| Output | A structured JSON program schema. The user must inspect the resulting graph in the editor before activating. |
| Human oversight (AI Act Art. 14) | Mandatory inspect step: the program is created `is_active=false`. The program detail page surfaces a non-dismissible review banner ("Corelyx generated this workflow from your description. Review every node, parameter, and connection before activating it.") and an "AI-generated" badge. Activation requires explicit user action. |
| Transparency (AI Act Art. 50) | Programs created via Genesis carry `metadata.genesis_model = "<model id>"` in their schema. The UI labels them as AI-generated (badge + banner). The program detail page shows the model used. |
| Cross-border transfer | Possible. Provider defaults, customer-selected model providers, and customer account settings may involve processing outside the EEA. Mitigations: (1) PII sanitization layer; (2) per-provider DPA/SCC and transfer-basis status tracked in the provider registry and `/subprocessors`; (3) BYOK means the user's own contract with the provider governs their data; (4) EU-only workspace mode blocks or warns on unresolved provider risk before publish/run. |
| Logging | Each Genesis call writes an `app_log` row with: model used, model fallback chain, validation outcome, PII redaction counts (categorized, no values), execution duration. Log retention: 90 days for metadata, 30 days for raw description preview. |
| Bypass / override paths | None. There is no API endpoint that creates an active AI-generated program in a single call. |
| Known limitations | Output may invent operation parameters that do not exist in the connector implementation; the post-genesis validator (`validatePostGenesis`) catches the most common cases but not all. Capability gaps (e.g. operations not in the prompt's reference) are bridged via HTTP nodes or agent steps. |

---

## System 2 — Runtime Agent Nodes

| Field | Value |
|---|---|
| Internal name | Agent Node Executor |
| Source code | [apps/runtime/engine/executor.py](apps/runtime/engine/executor.py) (`_call_llm`), [apps/runtime/engine/pii.py](apps/runtime/engine/pii.py) |
| Purpose | Execute LLM-backed reasoning steps inside a user-defined workflow. Used for summarization, classification, extraction, decision-making within a graph. |
| Risk classification (AI Act) | Depends on the customer's workflow. Corelyx is the deployer of the GPAI model; the customer is the deployer of the resulting AI system. Customers building workflows that fall into Annex III domains (employment, credit, healthcare, education, critical infrastructure, law enforcement, migration, justice) are responsible for high-risk obligations. Terms of Service prohibit use without an active approval gate in those categories. |
| Models used | Customer-selected per agent node, drawn from their BYOK keys. |
| Provider(s) | Same as Genesis (BYOK). |
| Data sent to model | Sanitized system prompt + sanitized input data from upstream nodes. Both pass through `sanitize_text_for_llm` / `sanitize_value_for_llm` before any HTTP call. |
| PII handling | Mandatory pre-call sanitization. The injected `_injection_guard` system header neutralizes prompt-injection attempts originating in connector data. |
| Output | Free-form text or structured JSON, fed to downstream nodes. |
| Human oversight (AI Act Art. 14) | Per-node `requires_approval` flag with timeout fail-safe. When set, execution pauses, an approval task is created, and the run cannot continue until a human approves within `approval_timeout_hours`. Approval actions are recorded with approver identity, decision, timestamp, and snapshot of the input the approver saw. |
| Transparency (AI Act Art. 50) | Agent node outputs carry the source node id; downstream UI surfaces them as agent output rather than user-authored content. |
| Cross-border transfer | Same posture as Genesis. |
| Logging | Per-node execution log entry with status, duration, and (subject to verbosity setting — default `METADATA_ONLY`) sanitized input/output snapshots. Verbosity is configurable per deployment via `EXECUTION_LOG_VERBOSITY=NONE\|ERRORS_ONLY\|METADATA_ONLY\|FULL`. |
| Bypass / override paths | Approval cannot be bypassed via API — the runtime checks the approval status from the database before continuing the graph. |
| Known limitations | Sanitization is regex/heuristic-based; it may not catch all PII varieties (e.g. names without other context, internal employee IDs). Customers processing special-category data should configure a stricter approval gate and conduct their own DPIA. |

---

## Cross-cutting controls

- **No fine-tuning.** Corelyx does not fine-tune, retrain, or modify any LLM. We remain a *deployer* under AI Act terminology, not a *provider*.
- **No automated decision-making with legal effect.** Corelyx never auto-acts on AI output without an explicit user-defined workflow. AI output that triggers an external API call (Slack post, Notion write, etc.) is the result of a workflow the customer authored, not a Corelyx decision.
- **Prohibited uses** (AI Act Art. 5) are forbidden by Terms of Service: subliminal manipulation, social scoring, real-time biometric ID in public, workplace emotion recognition, predictive policing.
- **AI literacy** (AI Act Art. 4): the program detail UI shows the model used, displays a review banner, and the docs explicitly state "AI output can be incorrect or incomplete."

---

## Change log

| Date | Change | Owner |
|---|---|---|
| 2026-04-28 | Initial inventory — Genesis + Agent Node Executor documented. | Engineering |
