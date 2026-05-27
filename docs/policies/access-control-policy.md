# Corelyx Access Control Policy

**Status:** Approved internal policy, pre-certification evidence  
**Owner:** Corelyx responsible person / founder  
**Approved:** 2026-05-27  
**Review cadence:** Quarterly

## Purpose

Define how Corelyx grants, reviews, and removes access to production systems and customer data.

## Requirements

- Administrative access must use named accounts, MFA, and least privilege.
- Service-role credentials, OAuth tokens, internal runtime secrets, and Vault material must stay in server-only code paths.
- Access to Supabase, Vercel, Railway, GitHub, Stripe, Resend, and analytics/admin tools is restricted to operational need.
- Access grants, role changes, and removals must be recorded in the access review log or issue tracker.
- Admin access is reviewed quarterly and after personnel or contractor changes.
- Production data access for support or debugging must be time-limited and tied to a support, incident, or engineering ticket.
- Shared accounts are not permitted except provider-managed emergency accounts where named access is technically unavailable; such exceptions must be recorded.

## Joiner, Mover, Leaver

| Event | Required action |
|---|---|
| Joiner | Grant only required tools after MFA is enabled. |
| Mover | Remove access no longer needed before granting new elevated access. |
| Leaver | Remove all tool access and rotate shared/emergency secrets if exposure is possible. |

## Customer Workspace Access

Corelyx operators do not access customer workflow payloads unless needed for support, security, legal obligations, or customer-authorised troubleshooting. Full prompt/output logging is disabled by default for sensitive workflows.
