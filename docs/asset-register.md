# Corelyx Asset Register

**Status:** Living register, pre-certification evidence  
**Owner:** Corelyx responsible person / founder  
**Last reviewed:** 2026-05-27  
**Review cadence:** Quarterly and before material architecture changes

| Asset | Type | Owner | Data classification | Region/residency | Purpose | Key controls |
|---|---|---|---|---|---|---|
| Corelyx Next.js web app | Application | Founder | Confidential | Vercel project region and CDN configuration | Editor, dashboard, API routes, billing, legal pages | TLS, auth, RLS-backed APIs, server-only secrets, CI checks |
| Corelyx Python runtime | Application | Founder | Restricted | Railway configured region | Workflow execution and connector calls | Internal auth, payload minimisation, runtime policy checks, secret redaction |
| Supabase project | Database/auth/Vault | Founder | Restricted | EU project expected for production | Postgres, Auth, Vault, RLS, audit data | RLS, encryption at rest, service-role isolation, migrations |
| GitHub repository | Source control | Founder | Confidential | Provider-managed | Code, issues, CI/CD configuration | MFA, branch protection, PR review, Dependabot/CodeQL where enabled |
| Vercel | Hosting | Founder | Confidential | EU-first compute where configured; global CDN may apply | Web app hosting and deployment logs | DPA/SCCs, deployment access control, logs minimised |
| Railway | Hosting | Founder | Restricted | EU runtime region where configured | Runtime worker hosting | DPA/SCCs, environment secrets, runtime logs minimised |
| Resend | Email | Founder | Confidential | United States/provider-managed | Transactional email | DPA/SCCs, no secrets in notifications |
| Stripe | Payments | Founder | Confidential | Provider-managed | Subscriptions, invoices, payments | Stripe-hosted checkout, no card data stored by Corelyx |
| OpenAI / Anthropic / customer LLM providers | AI providers | Customer + Founder | Restricted when used | Provider/account dependent | Optional model inference | Provider registry, DPA/SCC checks, EU-only mode blocking |
| OAuth connectors | Integrations | Customer | Restricted | Customer provider/tenant dependent | Gmail, Slack, Microsoft, etc. workflow actions | Server-side token helpers, Vault secret references, provider registry |
| Legal/security docs | Documentation | Founder | Public/internal | Repository | Trust Center, DPA, subprocessors, policies | Version control, review dates |

## Classification Guide

| Classification | Examples | Handling |
|---|---|---|
| Public | Public legal pages, marketing copy | May be published after review. |
| Internal | Roadmaps, internal process docs | Internal repository or workspace only. |
| Confidential | Source code, business records, deployment metadata | Named access, MFA, no public sharing. |
| Restricted | Credentials, customer payloads, execution logs, OAuth tokens | Server-side only, encrypted stores, redaction, strict access. |
