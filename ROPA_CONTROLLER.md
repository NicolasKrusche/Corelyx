# Corelyx Controller RoPA

**Version:** 0.1 draft  
**Status:** Internal record for legal review  
**Last updated:** April 2026  
**Role:** Controller for Corelyx account, billing, support, security, and marketing data.

> Legal review required: This Record of Processing Activities is an operational draft and must be reviewed by qualified Austrian/EU counsel before audit reliance.

## Controller Details

| Field | Value |
|---|---|
| Controller | Corelyx `[legal entity pending]` |
| Address | `[registered address pending]` |
| Data protection contact | `legal@corelyx.app` |
| Security contact | `security@corelyx.app` |
| DPO | `[to be appointed or documented as not required]` |

## Processing Activities

### 1. User Account Management

| Field | Record |
|---|---|
| Purpose | Create and manage Corelyx user accounts and platform sessions. |
| Legal basis | GDPR Art. 6(1)(b), contract. |
| Data subjects | Platform users and customer admins. |
| Data categories | Email, user ID, display name, avatar URL, profile settings, plan tier, sign-in timestamps. |
| Recipients/subprocessors | Supabase, hosting provider, email provider where account emails are sent. |
| Third-country transfers | Possible if subprocessors are outside EEA; use DPA/SCCs where required. |
| Retention | Contract duration plus deletion grace period unless legal retention applies. |
| Security measures | TLS, encrypted database/storage, RLS/owner checks, server-side session handling, audit logs. |

### 2. Billing and Entitlements

| Field | Record |
|---|---|
| Purpose | Manage paid plans, invoices, redemption codes, account entitlements, and usage limits. |
| Legal basis | GDPR Art. 6(1)(b), contract; Art. 6(1)(c), legal obligation for tax/accounting records. |
| Data subjects | Platform users and billing contacts. |
| Data categories | Email, Stripe customer/subscription identifiers, plan tier, plan expiry, redemption history, usage counters. |
| Recipients/subprocessors | Stripe or payment processor, Supabase. |
| Third-country transfers | Depends on payment processor configuration; DPA/SCCs required where applicable. |
| Retention | Billing records retained for statutory tax/accounting periods; entitlement data for account lifetime. |
| Security measures | Server-side billing webhooks, least-privilege service keys, audit logging. |

### 3. Security, Audit, and Abuse Prevention

| Field | Record |
|---|---|
| Purpose | Maintain platform security, investigate incidents, detect misuse, and support compliance evidence. |
| Legal basis | GDPR Art. 6(1)(f), legitimate interests; Art. 6(1)(c), legal obligation where incident records are required. |
| Data subjects | Platform users, admins, and affected workflow data subjects where present in logs. |
| Data categories | IP-derived request metadata where collected by infrastructure, audit logs, app events, error metadata, timestamps, user IDs. |
| Recipients/subprocessors | Hosting provider, Supabase, security tooling providers. |
| Third-country transfers | Avoid where possible; DPA/SCCs required for non-EEA processors. |
| Retention | Operational logs per retention policy; incident records per incident response policy. |
| Security measures | PII/secret redaction, audit logging, CI dependency scanning, SAST, incident response runbook. |

### 4. Support and Legal Requests

| Field | Record |
|---|---|
| Purpose | Respond to support, legal, data subject, and security requests. |
| Legal basis | GDPR Art. 6(1)(b), contract; Art. 6(1)(c), legal obligation; Art. 6(1)(f), legitimate interests. |
| Data subjects | Platform users, customer contacts, data subjects named in requests. |
| Data categories | Email, request details, response summaries, due dates, legal correspondence, support context. |
| Recipients/subprocessors | Email provider, Supabase, support tooling if added. |
| Third-country transfers | Depends on support/email tooling; DPA/SCCs required where applicable. |
| Retention | Data subject request records and support/legal records per retention policy. |
| Security measures | Request tracking, restricted access, audit logs, export/deletion workflows. |

### 5. Marketing Communications

| Field | Record |
|---|---|
| Purpose | Send optional product and marketing communications. |
| Legal basis | GDPR Art. 6(1)(a), consent, where required. |
| Data subjects | Prospects and users who opt in. |
| Data categories | Email, consent status, communication preferences. |
| Recipients/subprocessors | Email marketing provider if enabled. |
| Third-country transfers | Depends on provider; DPA/SCCs required where applicable. |
| Retention | Until withdrawal plus legal-defense retention period. |
| Security measures | Consent records, unsubscribe/withdrawal handling, suppression lists. |

## Review Cadence

Review quarterly and whenever a new subprocessor, product feature, processing purpose, or legal basis is introduced.
