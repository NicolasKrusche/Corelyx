# Data Protection Impact Assessment — Corelyx Platform

**Controller:** Corelyx (see Impressum for current legal identity)
**Assessment owner:** Responsible person named in the Impressum
**Status:** Completed — living document, reviewed at least annually or on material change
**Legal reference:** GDPR Art. 35; EDPB guidelines WP248; (where Corelyx deploys high-risk AI) EU AI Act Art. 27
**Last reviewed:** 2026-06-04
**Next review:** 2027-06-04 or on material change

> This is Corelyx's DPIA for **its own processing** as a controller/processor operating the platform. It is distinct from `DPIA_TEMPLATE.md`, which is the blank template provided to **customers** for their own workflows.

---

## 1. Is a DPIA required? (Art. 35(3) screening)

| Trigger | Applies? | Notes |
|---|---|---|
| Large-scale processing | Partially | Multi-tenant SaaS; volume grows with adoption. |
| Innovative use of technology (AI/LLM) | **Yes** | Workflows send user content to large language models. |
| Processing of communications content | **Yes** | Email bodies, documents, form responses are processed during execution. |
| Possible special-category data (Art. 9) | **Yes (incidental)** | Email/document content can contain health, religion, etc. — uncontrollable at intake. |
| Systematic monitoring / evaluation | Limited | No profiling of data subjects for decisions about them by Corelyx itself. |
| Matching/combining datasets | No | — |
| Vulnerable data subjects | Possible | Third parties (email senders) who are not Corelyx users. |

**Conclusion:** A DPIA is required, primarily driven by AI processing of communications content that may contain special-category data, including data of third parties who are not platform users.

---

## 2. Systematic description of the processing (Art. 35(7)(a))

**Purpose:** Let users build and run automations that read, transform, and act on their own data and connected accounts, including AI ("agent") steps.

**Data subjects:** (a) Corelyx account holders; (b) third parties whose personal data appears in content the user routes (e.g. people who emailed the user).

**Data categories:** account/identity data; workflow definitions and prompts; connection metadata; **encrypted** OAuth tokens and API keys (Supabase Vault); run/operational metadata; **workflow content** processed transiently during execution (may include Art. 9 data incidentally).

**Data flow:**
1. Trigger (e.g. Gmail Pub/Sub push → `/api/webhooks/gmail`, OIDC-verified) or schedule/manual.
2. Web app (Vercel, EU) matches active triggers and dispatches to the runtime.
3. Runtime (Railway, EU) executes nodes; connector nodes call the user's connected services; **agent nodes send prompt content to an LLM provider**.
4. Before any prompt leaves Corelyx infrastructure, **structured-identifier pseudonymization** runs (`engine/pii.py`): emails, phones, IBANs, IP addresses, national IDs, and payment cards are replaced with stable numbered placeholders; the re-identification mapping is held only in process memory for the run and is never persisted or transmitted (supplementary measure in the sense of EDPB Recommendations 01/2020, Use Case 2). Secrets are destructively redacted and never restored. Free-text prose (incl. names) is **not** removed.
5. Results are returned; execution logs are written **metadata-only by default** (`db.py` log policy), content not retained.

**Recipients / sub-processors:** Supabase (EU), Vercel (EU), Railway (EU), Inngest, Resend, Stripe, and **LLM providers** — by default the Corelyx platform key routes via **OpenRouter** (US, no countersigned DPA yet); optionally customer BYOK (Anthropic/OpenAI/Google/Mistral). Authoritative list: `/subprocessors`.

**Retention:** operational logs 90 days; execution payloads 30 days; runs 90 days; incidental IP in diagnostic logs anonymised within 7 days (automated job); secrets purged on disconnect/account deletion; billing records per statutory periods.

**Legal basis:** Art. 6(1)(b) (performing the requested automation/service); 6(1)(f) (security, reliability); 6(1)(c) (billing/tax). For Art. 9 content, the **user is responsible** for an Art. 9(2) condition; Corelyx does not intentionally process special-category data and offers controls to avoid it.

---

## 3. Necessity and proportionality (Art. 35(7)(b))

- **Data minimisation:** metadata-only logging by default; structured-identifier redaction before LLM; no training on customer data by Corelyx; content processed only to perform the configured automation.
- **Purpose limitation:** content is used solely for the user's automation, not for analytics or model training.
- **Storage limitation:** enforced retention windows + automated purge job.
- **Transparency:** Privacy Policy, DPA, `/subprocessors`, `/data-residency` disclose AI processing, the OpenRouter default, and transfer risk.
- **Data subject rights:** self-service deletion (account/programs/connections), export, `processing_restricted` flag (Art. 18), DSAR/DSR routes.
- **Proportionality of AI step:** AI is invoked only for nodes the user configures; deterministic connector nodes are preferred where possible.

---

## 4. Risks to data subjects and mitigations (Art. 35(7)(c)(d))

| # | Risk | Inherent severity | Mitigations in place | Residual |
|---|---|---|---|---|
| R1 | Special-category data in email/doc content sent to a US LLM with no DPA (platform key/OpenRouter) | High | Structured-identifier redaction; metadata-only logging; explicit warning in Privacy/DPA not to route Art. 9 data through the platform key; **EU-only workspace mode** blocks unresolved-risk providers at runtime; BYOK EU model option | **Medium** — depends on user choice; reduced further once eu_only is default and/or OpenRouter DPA signed |
| R2 | Third parties (email senders) have no relationship with Corelyx and did not consent | High | Corelyx acts on the controller-user's instruction (processor role); user bears the Art. 6/9 basis; redaction reduces identifiers; content not retained | Medium |
| R3 | Unauthorised access to stored data | High | TLS in transit, AES-256 at rest, Postgres RLS tenant isolation, Vault for secrets never returned to client, OIDC-verified webhooks, signed internal calls | Low |
| R4 | International transfer without safeguard | High | EU-region infra (Supabase/Vercel/Railway); per-provider DPA/SCC tracked in registry; transfer warnings; eu_only enforcement | Medium (OpenRouter) → Low once DPA in place |
| R5 | Over-retention of content | Medium | Metadata-only default; 30/90-day purge job; IP anonymisation ≤7 days | Low |
| R6 | Secret/token leakage | High | Vault references, secret redaction in logs, never returned to frontend | Low |
| R7 | Model provider trains on / retains prompts | Medium | Provider DPAs (no-train); OpenRouter no-retention-by-default (to be contractually confirmed); registry tracks `trains_on_customer_data` | Medium (OpenRouter "unknown") |

---

## 5. Outstanding actions

1. **Sign an enterprise DPA + confirm EU routing / no-retention with OpenRouter**, or move the platform default to an EU model with a DPA. (Owner: controller. Target: before scaling beyond pilot.)
2. **Default new EU workspaces to `eu_only`** so platform routing to unresolved-risk providers is blocked unless the user opts in. (Implemented.)
3. Complete **Google OAuth verification / CASA** for restricted Gmail scopes before exceeding the 100-user cap.
4. Keep `/subprocessors` registry, Privacy Policy, and this DPIA in sync on any provider change.
5. ~~Consider name/free-text redaction~~ **Implemented 2026-06-12:** strict privacy tier (`workspaces.pii_mode`) pseudonymizes person names via local NER (`engine/ner.py`, GLiNER or spaCy, on-server only); defaults on for eu_only workspaces. Remaining: install an NER backend in the production runtime image, and consider a stricter approval gate for workflows flagged as handling special-category data.

---

## 6. Conclusion

With the mitigations above, residual risk is **acceptable for general (non-special-category) personal data**. The principal residual risk is AI processing of communications content that may contain **special-category or third-party** data through the **platform key (OpenRouter, no countersigned DPA)**. This is mitigated by redaction, metadata-only logging, explicit user guidance, EU-only mode, and BYOK; it is reduced to **low** once Action 1 (OpenRouter DPA or EU default model) is complete. No prior consultation with the supervisory authority (Art. 36) is considered necessary at current scale, subject to re-assessment as volume grows.
