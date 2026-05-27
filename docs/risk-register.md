# Corelyx Risk Register

**Status:** Living risk register, pre-certification evidence  
**Owner:** Corelyx responsible person / founder  
**Last reviewed:** 2026-05-27  
**Scoring:** Likelihood 1-5, impact 1-5, residual risk after controls

| ID | Asset/process | Risk | L | I | Existing controls | Residual risk | Next action |
|---|---|---|---:|---:|---|---|---|
| R-001 | Supabase | RLS or service-role misuse exposes tenant data | 2 | 5 | Server-only service role, access helpers, tenant-isolation tests | Medium | Keep API review focused on workspace scoping |
| R-002 | OAuth connectors | Provider token leakage through logs or responses | 2 | 5 | Vault helpers, redaction, no frontend token responses | Medium | Expand secret linting and runtime audit checks |
| R-003 | Runtime | EU-only mode bypass through direct dispatch | 2 | 4 | Internal auth, runtime revalidation, provider policy blocks | Low | Add regression tests for new connector categories |
| R-004 | LLM providers | Customer data sent to provider lacking DPA/SCC evidence | 3 | 4 | Provider registry, publish checks, EU-only blocking | Medium | Require verified provider evidence before production approval |
| R-005 | Webhooks | Public webhook spoofing | 2 | 4 | Signature/token validation expectation, route validation | Medium | Review provider-specific webhook routes quarterly |
| R-006 | Logs | Sensitive prompts/outputs retained longer than needed | 2 | 4 | Hashes/metadata by default, workspace retention controls | Low | Monitor retention job results |
| R-007 | Supply chain | Dependency vulnerability exploited | 3 | 4 | Dependabot/lockfiles, tests, CI, vulnerability triage | Medium | Document critical patch SLA in security page |
| R-008 | Cloud provider outage | Vercel/Railway/Supabase outage affects service | 3 | 3 | Managed platforms, rollback, incident plan | Medium | Annual restore drill and status-page placeholder |
| R-009 | Human error | Misconfigured workspace or provider residency | 3 | 4 | Data-flow preview, publish checklist, warnings | Medium | Improve admin review workflow |
| R-010 | AI high-impact workflow | Autonomous action without human oversight | 3 | 5 | AI Act fields, high-risk blocking, approval gates | Medium | Expand templates for approval gates |
| R-011 | Billing/provider records | Payment data or invoice records mishandled | 1 | 4 | Stripe-hosted payment flow, limited metadata | Low | Review Stripe DPA annually |
| R-012 | Email notifications | Sensitive data included in transactional email | 2 | 3 | Notification minimisation and redaction policy | Low | Add email content review checklist |
| R-013 | Admin account compromise | Cloud console or GitHub access misused | 2 | 5 | MFA, named accounts, least privilege, quarterly review | Medium | Maintain emergency access and rotation records |
| R-014 | Incident response | Notification deadlines missed | 2 | 4 | Runbook with 24h/72h timelines and templates | Low | Semiannual tabletop drill |
| R-015 | Certification claims | Marketing overclaims compliance status | 2 | 4 | Trust Center honest status, claim search, review policy | Low | Quarterly website copy scan |
| R-016 | Data deletion | Customer data not deleted across logs/backups | 2 | 4 | Retention function, account deletion, provider retention notes | Medium | Evidence retention job runs |
| R-017 | Customer HTTP endpoint | Workflow sends data to unknown destination | 3 | 4 | Generic HTTP blocked in EU-only and missing-DPA checks | Medium | Add customer transfer documentation UX |
| R-018 | Schema translation | Editor/runtime mismatch changes data flow | 2 | 4 | Shared schema package, validators, schema tests | Low | Keep translation tests with connector changes |
