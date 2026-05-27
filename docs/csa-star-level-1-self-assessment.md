# CSA STAR Level 1 Self-Assessment Preparation

**Owner:** Corelyx founding team  
**Last reviewed:** 2026-05-27  
**Status:** Prepared evidence map; official CSA CAIQ upload is not claimed until submitted and listed.

## Scope

Corelyx SaaS platform, including the Next.js web app, Python runtime, Supabase database, workflow execution logs, credential handling, public Trust Center, and subprocessor registry.

## CAIQ Evidence Map

| CAIQ area | Corelyx evidence |
|---|---|
| Identity and access management | Access-control policy, GitHub/Vercel/Supabase MFA records, owner/admin workspace roles |
| Data security and privacy lifecycle | Privacy policy, DPA, data-export schema, retention controls, DSR flow |
| Cryptography and key management | TLS, Supabase encryption, Vault-backed secret handling, no provider tokens returned to clients |
| Logging and monitoring | Run/node audit logs, provider/model metadata, policy checks, retention expiry |
| Incident response | `INCIDENT_RESPONSE.md`, incident-response policy, 72-hour customer notification clause |
| Change management | PR template deploy checklist, change-management policy, release log in `CHANGELOG.md` |
| Supply-chain management | Provider registry, supplier-security policy, subprocessor page, annual review dates |
| Business continuity | Business-continuity policy, Supabase backup assumptions, recovery objectives |
| Cloud security | Shared-responsibility matrix, cloud-service inventory, tenant-isolation tests |
| AI governance | AI system inventory, AI Act risk fields, human approval gates, compliance export |

## Submission Rules

- Complete the official CSA CAIQ spreadsheet before upload.
- Upload only truthful self-assessment answers and evidence links.
- Do not show a CSA STAR badge until the listing is live in the CSA registry.
