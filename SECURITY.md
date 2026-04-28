# Corelyx — Security Policy

**Last updated:** 2026-04-28

## Reporting a vulnerability

If you believe you have found a security vulnerability in Corelyx, please report it privately. Do **not** open a public GitHub issue, do not post on social media, and do not exploit the issue beyond what is necessary to confirm it.

**Email:** [security@corelyx.app](mailto:security@corelyx.app)

For sensitive reports, request our PGP key in your initial email and we will respond with the fingerprint and key block.

Please include:

- A description of the issue and its potential impact
- Steps to reproduce (proof-of-concept code is welcome)
- Affected versions, endpoints, or environments
- Your contact information and whether you would like public credit

## What to expect

| Stage | Target time |
|---|---|
| Acknowledgement of report | Within 2 business days |
| Initial triage and severity assessment | Within 5 business days |
| Status update cadence during fix | At least every 7 days |
| Public disclosure | Coordinated with reporter, typically within 90 days of report |

We follow a standard coordinated-disclosure process. We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations and service disruption
- Report the issue privately and give us a reasonable time to fix it
- Do not exfiltrate, modify, or destroy customer data
- Do not perform DoS, social engineering, or physical attacks against Corelyx staff or infrastructure

## Severity & patch SLA

| Severity | Patch SLA (production) | Examples |
|---|---|---|
| Critical | 24 hours | RCE, auth bypass, cross-tenant data access |
| High | 7 days | Privilege escalation, secret exposure, stored XSS in admin paths |
| Medium | 30 days | Reflected XSS, missing rate limit, info disclosure in non-sensitive context |
| Low | 90 days | Verbose error messages, deprecated header, minor hardening |

This aligns with our NIS2 obligations (compliance_plan.md §5.2).

## Scope

In scope:

- `*.corelyx.app` web and API surfaces (when in production)
- The Corelyx open-source repositories under `github.com/corelyx`
- The workflow runtime exposed via Corelyx's hosted endpoints

Out of scope:

- Findings in third-party services (report to that provider)
- Automated tool output without manual verification
- Best-practice deviations without a concrete attack vector
- Issues requiring physical access, root on a victim's device, or social engineering

## Security commitments

For details on our technical and organizational measures, see [compliance_plan.md](compliance_plan.md) §3.7 (GDPR Art. 32) and §5.2 (NIS2 Art. 21). Highlights:

- TLS 1.3 for all data in transit; AES-256 at rest
- Server-side-only secrets; OAuth tokens stored in Supabase Vault, never returned to the frontend
- Pre-LLM PII sanitization for every prompt that leaves our infrastructure
- Tenant-scoped row-level security (Postgres RLS) on all customer data
- Centralized audit logging with tamper-evident retention
- EU-only production hosting (Vercel EU edges, Railway EU region, Supabase EU region)

## Hall of fame

Researchers who report valid vulnerabilities and consent to credit will be listed here.

*(No reports yet.)*
