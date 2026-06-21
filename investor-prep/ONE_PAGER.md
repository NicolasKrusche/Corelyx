# Corelyx — One-Page Briefing (glance during the call)

**Pitch:** *Describe what you want to automate. Corelyx designs the agent graph, you tune it visually — then it runs itself.*
**What:** Visual AI workflow automation, EU-first, with compliance evidence built in. Not a Zapier clone — the moat is AI generation + GDPR/AI-Act infrastructure + human approval gates, all architectural.

## The numbers
- **200+** connectors · **2 months** first-commit→product (started 2026-04-05) · pilot stage, pre-/early-revenue
- Plans: **€0 / €9.90 / €19.90 / €49.90** per month · EUR, EU-invoiced · all connectors on every plan
- Retention: payloads **30d**, logs/runs **90d**, IPs **7d** · Patch SLA **24h/7d/30d/90d**
- EU hosting: Supabase **Frankfurt**, Vercel **Frankfurt/Dublin**, Railway **Amsterdam**

## Stack (one breath)
Next.js 15 + React Flow (web) · Python FastAPI + **LangGraph** (runtime) · Supabase Postgres/Auth/RLS/**Vault** · Stripe · Inngest · **schema-first** (the diagram *is* the executable).

## Differentiators (say these)
1. **Genesis** AI generates a *validated* graph from plain language (regulatory pre-filter → generate → validate).
2. **What you see is what runs** — no hidden YAML; validation gates before save & before run.
3. **Approval gates enforced in the engine**, not bypassable via API.
4. **Compliance is structural & already documented**: DPIA, ROPA (controller+processor), DPA on-product, AI System Inventory, code-backed subprocessor registry, per-run Art. 30 records.
5. **PII pseudonymized before the LLM**; secrets in Vault, never sent to the browser.

## Compliance posture (legal track)
- **GDPR:** EU-region infra; DPIA done (rev. 2026-06-04); DPA without a sales call; DSAR/export/delete; Art. 18 restrict flag.
- **AI Act:** we're a *deployer* (no training/fine-tuning); Genesis = minimal-risk; customer = deployer for Annex III; Art. 5 prohibited uses banned in ToS; Art. 14 oversight real (AI programs inactive until reviewed; runtime approval checks).
- **NIS2:** coordinated disclosure + SLAs + incident runbook.
- **Jurisdiction:** Austrian law, Austrian DPA.

## ⚠️ Landmines — answer with candor, not spin
| Question | Your answer in one line |
|---|---|
| **Default AI key → US OpenRouter, no DPA** (THE big one) | "We disclose it ourselves. Mitigated by pre-LLM redaction + metadata-only logs + EU-only mode + BYOK; fix in motion = enterprise DPA *or* EU-default model." |
| **Is there a company / who's liable?** | "Built product-first; incorporation (AT GmbH) + named DPO are near-term and part of use-of-funds." |
| **SOC 2 / pentest?** | "Not yet; we self-red-team hard (June 11 audit, fixed next day) + public disclosure program; SOC 2 + pentest are funded roadmap." |
| **Regex PII won't catch all** | "Defense-in-depth, never claimed perfect; structured IDs reliable, names via on-server NER, user controls routing + approval gates." |
| **'Minimal risk' self-serving?** | "Legally correct deployer/provider split, reasoned in writing; high-risk = customer-as-deployer, ToS forces approval gate." |
| **Google Gmail scopes at scale** | "Under the unverified-app cap now; CASA verification scheduled before scaling." |
| **Only 2 months old** | "That velocity *is* the signal — 200+ connectors + runtime + full compliance docs; raise funds GTM + hardening." |

## Don't say
"GDPR/AI-Act **compliant**" (say *compliance infrastructure / designed for*) · "platform key is EU-compliant" (it isn't yet) · "powerful/seamless/robust" · imply SOC 2 exists.

## Ask them back
- Legal: "OpenRouter DPA first, or move default to an EU-hosted model first?"
- Dev: "What would you harden before a 100x load jump?"
