# Corelyx — Investor Interview Prep

**Prepared:** 2026-06-13 · **Audience:** mixed panel (legal/compliance + technical/dev investors)
**Goal:** answer anything on either track with grounded, honest, defensible answers.

> How to use this: read §1 (the snapshot) and §7 (the landmines) the night before. Skim §3–§6 to refresh specifics. The landmines section is the one that wins or loses the room — investors test you on what you'd rather not discuss, and a calm, prepared answer to the OpenRouter/DPA question signals more competence than any feature demo.

---

## 1. 60-Second Company Snapshot (memorize this)

**What it is:** Corelyx is a visual AI workflow automation platform for teams in regulated (EU-first) environments. You describe an automation in plain language; our AI layer (**Genesis**) generates a validated workflow *graph*; you review and edit it visually; the runtime executes it with credentials that never leave the server. Every run is auditable.

**One-liner:** *"Describe what you want to automate. Corelyx designs the agent graph, you tune it visually — then it runs itself."*

**Why it's different (the single sharpest line):** You can build a workflow with AI, *see exactly what will run*, require a human to approve sensitive steps, and produce GDPR Art. 30 processing records — without leaving the product or making a sales call. Zapier, n8n, and Make treat compliance and approvals as afterthoughts; for us they're architectural.

**Stage (be honest):** Built fast — first commit **2026-04-05**, so roughly **two months** to a working multi-tenant product with **200+ connectors**, an AI generation layer, a Python execution runtime, and a full EU-compliance documentation set. Pre-/early-revenue, pilot stage.

**Team:** small founding engineering team (3 contributors). Austrian-built.

**The market wedge:** "EU-first automation with compliance evidence built in." We're not trying to out-feature Zapier; we're the automation tool an EU ops/compliance team can actually get through procurement.

---

## 2. Product Facts (so you never fumble a detail)

| Thing | Fact |
|---|---|
| Core loop | Plain-language prompt → Genesis generates schema → visual edit (React Flow) → runtime executes |
| Architecture stance | **Schema-first**: a canonical JSON workflow schema is the source of truth; the editor and runtime both translate to/from it. "What you see is what runs." |
| Genesis | Two-step: a fast EU-regulatory pre-filter identifies obligations (GDPR / AI Act / NIS2), then the main generation prompt bakes those constraints in |
| Connectors | **200+** (206 in the runtime): Gmail, Slack, Notion, GitHub, Google Sheets/Drive/Docs/Calendar, Airtable, HubSpot, Asana, Outlook, Typeform, GitLab, Jira, Confluence, Dropbox, Shopify, Zoom, Sentry, etc., plus generic HTTP |
| Human-in-the-loop | Approval gates are first-class: a run *pauses*, creates an approval task, and cannot continue until a human approves within a timeout. Enforced in the runtime, not bypassable via API |
| Agents | Gated Solo+ tier; every agent run produces a user-facing report (runtime-enforced). Agents are deliberately distinct from workflows |
| Triggers | Manual, cron, webhooks (provider-signed), external API |
| AI model options | Platform key (routed via OpenRouter) for zero-setup, **or** BYOK (Anthropic/OpenAI/Google/Mistral) on paid plans |
| Audit trail | Per-run node status, outputs, failures, approvals, connector outcomes |

**Pricing:** Free €0 (2 programs, 50 runs/mo) · Solo €9.90/mo (5 programs, 75 runs, BYOK) · Team €19.90/mo (unlimited programs, 3 seats, approvals, 500 runs) · Scale €49.90/mo. EUR, invoiced by an EU entity. All plans include all connectors.

---

## 3. Technical Track — Likely Questions & Answers

**Q: Walk me through the architecture.**
Monorepo (pnpm + Turborepo). Three runtime pieces: (1) `apps/web` — Next.js 15 App Router: UI, API routes, OAuth, billing, admin. (2) `apps/runtime` — Python 3.11 / FastAPI executing validated schemas via **LangGraph**. (3) Shared `packages/schema` (TypeScript types + Zod validators) and `packages/db` (Supabase clients + generated DB types). Data layer is Supabase (Postgres, Auth, RLS, Realtime, Vault). The canonical schema is the contract between all three — the editor is one projection of it, the runtime is another.

**Q: Why schema-first? What's the benefit?**
The visual graph is *directly tied* to the executable schema — there's no hidden YAML that diverges from the diagram. Validation gates run before save and before execution, so an invalid schema never reaches the runtime. It also means Genesis output is checkable: we validate AI-generated schemas (`validatePostGenesis`) before they're ever runnable, and AI programs are created inactive until a human inspects them.

**Q: How does the AI generation actually work — is it just a wrapper on GPT?**
No. Genesis is a constrained generation pipeline: a regulatory pre-filter runs first, then a system prompt with hard security/structure rules produces a JSON graph, then a validator catches hallucinated connector operations/params. We don't fine-tune or train any model — we stay a *deployer*, not a *provider*, in AI Act terms. The prompt is kept in sync with the actual connector catalog (`lib/genesis/prompt.ts`) so generated operation names map to real implementations.

**Q: How do you keep tenants isolated?**
Postgres **row-level security (RLS)** on all customer data — every row is tenant-scoped. Service-role DB clients live only in server-only code paths, never shipped to the browser. Credentials (OAuth tokens, API keys) live in **Supabase Vault**, referenced by opaque IDs, and are never returned to frontend responses.

**Q: What stops prompt injection from connector data (e.g., a malicious email body)?**
Agent nodes inject an `_injection_guard` system header that neutralizes injection attempts originating in upstream connector data, and all input is sanitized before the LLM call. It's a mitigation, not a guarantee — we're candid that LLM injection is an open industry problem, which is exactly why approval gates exist for sensitive actions.

**Q: Scalability / reliability?**
Async orchestration, retries, and scheduling via Inngest; stateless runtime on Railway (EU) that scales horizontally; execution is metadata-logged by default to keep storage bounded. Honest current state: pilot-scale load, not yet stress-tested at thousands of concurrent runs — that's a known next step, not a solved problem.

**Q: Test coverage / quality bar?**
TypeScript strict, ESLint, Vitest on web, pytest on the runtime, schema translation tests required when node/edge/trigger/connector behavior changes. We ran a full-site QA + security pass on 2026-06-11 (50+ pages, 80+ endpoints), documented every finding, and fixed the actionable set the next day. (See §7 — this is a strength if framed as "we red-team ourselves," a weakness if you hide it.)

**Q: What's the moat technically? Can't Zapier add AI generation?**
They can add a generate button. What's hard to retrofit is the *combination*: schema-first executable-equals-diagram, approval gates enforced in the engine, per-run Art. 30 records, code-backed subprocessor registry, EU-only runtime enforcement, and PII pseudonymization before the LLM. That's an architecture decision made at the foundation, not a feature you bolt on. Our two-month build velocity is itself evidence the team can out-execute.

---

## 4. Legal / Compliance Track — Likely Questions & Answers

**Q: What's your GDPR posture, concretely?**
Not a checkbox — it's documented and code-backed. We maintain: a completed **DPIA** for our own processing (reviewed 2026-06-04), **ROPA** for both controller and processor roles, a **DPA** available on the product without a sales call, a **subprocessor registry** rendered from code (`provider-registry.ts`) and published at `/subprocessors` and `/data-residency`, per-run **Art. 30 processing records**, and self-service data export + deletion (DSAR/DSR routes, an Art. 18 `processing_restricted` flag). Legal basis: Art. 6(1)(b) for performing the automation, (f) for security, (c) for billing.

**Q: Where is data hosted? Does customer data leave the EU?**
Production infra is EU-region: Supabase (Frankfurt, eu-central-1), Vercel (Frankfurt/Dublin), Railway (Amsterdam). TLS 1.3 in transit, AES-256 at rest. **The honest exception is AI inference** — see §7. We offer **EU-only workspace mode** that blocks unresolved-transfer-risk providers *before a run executes*, and BYOK with EU-eligible model keys.

**Q: How do you handle the EU AI Act?**
We maintain an internal **AI System Inventory** (required for AI systems we deploy). Both AI systems — Genesis and the runtime agent executor — are documented with risk classification, data sent, human-oversight mechanism (Art. 14), and transparency (Art. 50). We classify ourselves as a **deployer of GPAI**, not a provider (no fine-tuning/training). Genesis output is **minimal-risk** (a general tool, no automated decisions with legal effect). Where a *customer* builds an Annex III high-risk workflow on top of us, **they** are the deployer of that high-risk system — and our ToS forbids high-risk-domain use without an active approval gate. Prohibited practices (Art. 5: social scoring, real-time biometric ID, workplace emotion recognition, predictive policing, subliminal manipulation) are banned in the ToS.

**Q: Art. 14 human oversight — show me it's real, not marketing.**
AI-generated programs are created `is_active=false` with a non-dismissible review banner and an "AI-generated" badge; activation requires explicit user action; there is **no API path** that creates an active AI-generated program in one call. At runtime, a node's `requires_approval` flag pauses execution, creates an approval task, and the engine checks approval status in the database before continuing — approvals can't be bypassed via API and are recorded with approver identity, decision, timestamp, and a snapshot of what they saw.

**Q: How do you minimize PII exposure to LLMs?**
Before any prompt leaves our infrastructure, **structured-identifier pseudonymization** runs: emails, phone numbers, IBANs, IP addresses, national IDs, and payment card numbers are replaced with stable numbered placeholders (e.g. `[EMAIL_1]`). The re-identification map is held only in process memory for that run — never persisted or transmitted — and real values are substituted back into outputs/connector actions on our side. Secrets/credentials are *destructively* redacted and never restored. On the **strict privacy tier** (default for EU-only workspaces with an NER backend) we also pseudonymize person names, detected entirely on our servers. Honest limit: free-text prose is not removed, and detection is heuristic/NER-based — not perfect (see §7).

**Q: Special-category (Art. 9) data?**
We don't intentionally process it, but email/document content can contain it incidentally — uncontrollable at intake. Our DPIA names this as the principal residual risk. Mitigations: redaction, metadata-only logging by default, explicit guidance not to route Art. 9 data through the platform key, EU-only mode, BYOK. The **user remains responsible** for an Art. 9(2) condition for what they route through us — we're the processor acting on their instruction.

**Q: Retention?**
Operational logs 90 days; execution payloads 30 days; runs 90 days; incidental IPs in diagnostic logs anonymized within 7 days (automated job); secrets purged on disconnect/account deletion; billing per statutory periods.

**Q: Who's the legal entity? Governing law?**
Austrian law; Austrian Data Protection Authority as lead supervisory authority. Entity details are environment-driven in `legal.ts` (entity name, VAT/UID, register number, address) and surfaced in the Impressum. **Candid status:** the structure is currently lightweight (sole-proprietor-style responsible person; DPO "TBA") — incorporation and a named DPO are on the near-term path (see §7).

**Q: NIS2 / security disclosure?**
We have a published security policy with a coordinated-disclosure process, severity-based patch SLAs (Critical 24h → Low 90d) aligned to NIS2 Art. 21 obligations, and an incident-response runbook.

---

## 5. Business / Market Questions (both tracks ask these)

**Q: Who's the customer and why do they pick you over Zapier?**
Primary: ops/RevOps/data teams at EU or EU-serving companies who must automate across SaaS *and* can have their data handling audited. They arrive asking "will this store our data outside the EU," "can we prove what happened," "can a human approve before it hits a customer," "does procurement need to sign your DPA." We're built to answer all four "yes." Secondary: solo founders/power users who want serious automation cheaply.

**Q: TAM / why now?**
Workflow automation is a large established market (Zapier/Make/n8n). The "now" is the collision of (a) LLMs making natural-language → working-automation real, and (b) the EU AI Act (in force since Aug 2025) + GDPR enforcement making *compliance evidence* a buying requirement, not a nice-to-have. We sit exactly on that intersection.

**Q: Business model / unit economics?**
SaaS subscription (€0–49.90/mo tiers), EUR-invoiced. AI cost control via BYOK on paid tiers (LLM spend goes to the customer's own provider account) and metered platform credits for the no-setup path — so we're not subsidizing unbounded inference.

**Q: What's defensible long-term?**
Compliance infrastructure compounds: the more regulated workflows run on us, the more the audit-trail/approval/records layer becomes switching-cost. Plus the connector breadth (200+) and the Genesis prompt-to-catalog sync are an execution moat that took real work.

---

## 6. Key Numbers Cheat-Sheet

- **200+** connectors (206 implemented) · **2 months** from first commit to current product
- Pricing **€0 / €9.90 / €19.90 / €49.90** per month
- Retention: **30d** payloads · **90d** logs/runs · **7d** IP anonymization
- Patch SLA: **24h** critical · **7d** high · **30d** medium · **90d** low
- Subprocessor notice: **30 days** before a new one processes data
- EU regions: Supabase **Frankfurt** · Vercel **Frankfurt/Dublin** · Railway **Amsterdam**
- AI Act in force since **2 Aug 2025**; DPIA reviewed **2026-06-04**

---

## 7. The Landmines — Tough Questions You Must Not Be Caught On

> These are the real ones. For each: the question, the honest fact, and the *framed answer*. Lead with candor — these investors will respect "here's the gap and here's our plan" far more than a dodge, and several of these are discoverable in our own public docs.

### 🔴 7.1 "Your *default* AI path sends EU customer data to a US provider with no DPA."
**The fact (don't deny it):** The platform model key routes through **OpenRouter (US)**, and there is currently **no countersigned DPA or SCCs** in place. This is in our own DPIA and subprocessor registry as the principal residual transfer risk.
**Framed answer:** "Correct, and we disclose it ourselves rather than bury it. Three things contain the risk today: structured-identifier pseudonymization before anything leaves our EU runtime, metadata-only logging so content isn't retained, and **EU-only workspace mode** that blocks that path at runtime. Customers who need a signed DPA use BYOK with an EU-eligible key. The fix is in motion: we're pursuing an enterprise DPA with OpenRouter with confirmed EU routing, *or* we move the platform default to an EU-hosted model with a DPA. Until one lands, we don't claim the platform key is EU-resident, and we tell customers not to route special-category data through it." **This is the #1 question — rehearse it cold.**

### 🔴 7.2 "Is there even a company? Who's liable?"
**The fact:** Entity is currently lightweight (sole-proprietor-style responsible person in Austria; DPO listed "TBA"; entity fields are env-configured).
**Framed answer:** "We built product-first to validate the wedge before incorporating. Incorporation (likely an Austrian GmbH) and appointing/contracting a DPO are near-term, and frankly part of what this round funds — getting procurement-ready legal structure to match the procurement-ready product. The compliance *documentation* is already ahead of the corporate structure, which is the unusual-but-deliberate order for a compliance-led product."

### 🟠 7.3 "Have you had a real security audit / pentest? SOC 2? ISO 27001?"
**The fact:** No third-party SOC 2 / ISO / external pentest yet. The 2026-06-11 audit was internal (automated tooling + self red-team). Security "hall of fame" is empty (no external reports yet).
**Framed answer:** "Not yet — we self-audit aggressively (full-site security pass on June 11, every finding documented, actionable ones fixed within a day) and we run a public coordinated-disclosure program with defined SLAs. A third-party pentest and a SOC 2 Type I path are on the roadmap and are a use-of-funds line. We'd rather show you we *find and fix our own issues* than claim a certification we haven't earned."

### 🟠 7.4 "Your PII redaction is regex — it won't catch everything."
**The fact:** True. Structured identifiers are regex/heuristic; names need an NER backend that must be installed in the prod runtime image (an open action item); free-text prose isn't removed.
**Framed answer:** "Right — we never claim it's a guarantee, we claim it's defense-in-depth. Structured identifiers (emails, IBANs, cards, national IDs) are reliably caught; names go through on-server NER on the strict tier; and the real safety net is that the *user controls what they route* plus approval gates plus EU-only mode. We're explicit in the DPIA and privacy policy about the limit. Deeper redaction is iterative."

### 🟠 7.5 "AI-Act 'minimal risk' — isn't that a self-serving classification?"
**The fact:** We self-classify Genesis as minimal-risk and push high-risk obligations onto the customer-as-deployer.
**Framed answer:** "It's the legally correct split, and we've reasoned it in writing. We're a deployer of general-purpose AI; we don't make automated decisions with legal effect — the user authors the workflow and a human can gate any consequential action. When a customer builds something in an Annex III domain, *they* become the high-risk deployer, and our ToS requires an approval gate there. We're not offloading responsibility we legally hold; we're correctly allocating it and giving the customer the oversight tools the Act requires."

### 🟡 7.6 "Google restricted scopes — are you actually allowed to touch Gmail at scale?"
**The fact:** Google OAuth verification / CASA security assessment for restricted Gmail scopes is **not yet complete** — there's an effective ~100-user cap until it is.
**Framed answer:** "We're under the unverified-app user cap now, which is fine for pilot. CASA verification is a known gate before we scale Gmail beyond it, and it's scheduled. It's a process/cost item, not a technical blocker."

### 🟡 7.7 "Two months old — is this real or a prototype?"
**The fact:** First commit 2026-04-05. Pre-revenue, pilot stage.
**Framed answer:** "Two months to a multi-tenant product with 200+ connectors, an AI generation pipeline, a Python execution runtime, *and* a complete EU-compliance documentation set is the signal, not a red flag — it shows the team's execution velocity and that compliance was designed in from day one, not retrofitted. What we're raising for is the go-to-market and the legal/security hardening (incorporation, DPO, pentest, OpenRouter DPA, CASA) that turn a strong product into a sellable one."

### 🟡 7.8 "Vendor lock-in / dependency risk (Supabase, OpenRouter, LangGraph)?"
**Framed answer:** "Schema-first and BYOK both reduce lock-in for the customer. For us, Postgres/Supabase is portable (it's just Postgres + standard auth), and the model layer is abstracted behind a provider registry, so swapping OpenRouter for a direct EU model is a config change, not a rewrite — which is also how we'd resolve 7.1."

---

## 8. Things to Say / Things to Avoid

**Lead with (true and strong):**
- "We disclose our own gaps before you find them." (You literally can — point at `/subprocessors`.)
- "Executable equals the diagram — no hidden logic."
- "Compliance is architectural, and the docs already exist: DPIA, ROPA, DPA, AI inventory, subprocessor registry."
- "Approval gates are enforced in the engine, not bypassable via API."
- "Two months, 200+ connectors — judge the execution velocity."

**Avoid (will get you caught):**
- Claiming the platform AI key is "fully EU-compliant" — it isn't yet (7.1).
- Saying "GDPR compliant" / "AI Act compliant" as an absolute — say "compliance *infrastructure*," "designed for," "evidence and controls." Final compliance depends on the customer's use, config, and providers. (Your own brand doc already hedges this correctly — match it.)
- Implying SOC 2 / ISO / external pentest exists (7.3).
- Overstating company maturity (7.2).
- "Powerful / seamless / robust / game-changing" — your brand voice bans these; investors notice substance-free hype.

---

## 9. Two Questions to Have Ready to *Ask Them* (signals you're investable)
1. To the legal investor: "Given the OpenRouter/DPA gap, would you prioritize signing the enterprise DPA or moving the default to an EU-hosted model first?" (shows you're already solving it).
2. To the dev investor: "Where would you want to see the architecture hardened before a 100x load increase?" (shows you think past the demo).

---
*Sources: README, CORELYX_BRAND, SECURITY, SUBPROCESSORS, AI_SYSTEM_INVENTORY, DPIA_CORELYX, AUDIT_REPORT_2026-06-11, BUG_REPORT, TODO, legal.ts, git history. Every claim here is traceable to a repo artifact — if an investor asks "how do you know," you can show them the file.*
