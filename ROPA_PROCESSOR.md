# Corelyx Processor RoPA

**Version:** 0.1 draft  
**Status:** Internal record for legal review  
**Last updated:** April 2026  
**Role:** Processor for customer-configured workflow data.

> Legal review required: This Record of Processing Activities is an operational draft and must be reviewed by qualified Austrian/EU counsel before audit reliance.

## Processor Details

| Field | Value |
|---|---|
| Processor | Corelyx `[legal entity pending]` |
| Address | `[registered address pending]` |
| Data protection contact | `legal@corelyx.app` |
| Security contact | `security@corelyx.app` |
| DPO | `[to be appointed or documented as not required]` |

## Controller Categories

Corelyx processes personal data for customers using Corelyx to design, run, and supervise workflow automations. Each customer is a separate Controller for its own workflow content and connected application data.

## Processing Activities

### 1. Workflow Design and AI-Assisted Generation

| Field | Record |
|---|---|
| Processing category | Creating workflow schemas from user input and selected connector metadata. |
| Controller instructions | Customer prompts, selected connections, workflow edits, and saved configuration. |
| Data categories | Workflow descriptions, connector names/providers/scopes, generated schemas, validation results. |
| Data subjects | Customer employees/admins; possible third parties if customer includes personal data in prompts. |
| Subprocessors | LLM provider, Supabase, hosting provider. |
| Third-country transfers | Possible for non-EEA LLM providers; DPA/SCCs required before production personal-data use. |
| Retention | Workflow schemas retained until customer deletion; prompts/log metadata per retention policy. |
| Security measures | PII/secret prompt sanitization, warning labels, export/deletion mechanisms, audit logs. |

### 2. Workflow Execution

| Field | Record |
|---|---|
| Processing category | Executing customer-defined automation steps and routing data between connectors. |
| Controller instructions | Active workflow schema, trigger configuration, execution mode, and connector authorization. |
| Data categories | Trigger payloads, connector payloads, workflow variables, execution metadata, node input/output payloads where retained. |
| Data subjects | Individuals contained in customer connected systems, such as contacts, leads, employees, support users, or end customers. |
| Subprocessors | Supabase, hosting/runtime provider, customer-selected connector providers, LLM provider if customer uses an AI node. |
| Third-country transfers | Depends on customer-selected connectors and LLM provider; document in customer DPA/subprocessor terms. |
| Retention | Payloads cleared according to data retention job; run metadata retained according to retention policy. |
| Security measures | Server-side credentials, Vault storage, execution log redaction, retention purge, tenant/owner checks. |

### 3. Connector Credential Management

| Field | Record |
|---|---|
| Processing category | Storing and using customer connector tokens and API keys. |
| Controller instructions | Customer authorization and saved connection configuration. |
| Data categories | OAuth token material, API key material, scopes, provider metadata, validation timestamps. |
| Data subjects | Customer admins and connected account owners. |
| Subprocessors | Supabase Vault, hosting provider, relevant connector providers. |
| Third-country transfers | Depends on connector provider; customer-selected connectors may process data outside EEA. |
| Retention | Until revoked, connection deleted, workflow deleted, or account deleted. |
| Security measures | Secret values stored server-side only, Vault secret IDs excluded from export, secrets redacted from logs and LLM prompts. |

### 4. Human Approval Gates

| Field | Record |
|---|---|
| Processing category | Pausing workflow execution for human review and logging approval/rejection decisions. |
| Controller instructions | Customer workflow configuration and approval decision. |
| Data categories | Approval context, node execution references, decision note, approver user ID, timestamps. |
| Data subjects | Approvers and any individuals represented in approval context. |
| Subprocessors | Supabase, hosting/runtime provider, email provider if notifications are enabled. |
| Third-country transfers | None intended except configured subprocessors. |
| Retention | Approval records and audit logs according to retention policy. |
| Security measures | Pending-state guard, timeout fail-safe rejection, immutable app log entries, processing restriction checks. |

### 5. Data Subject Request Assistance

| Field | Record |
|---|---|
| Processing category | Assisting customers/users with access, export, restriction, portability, and deletion workflows. |
| Controller instructions | Request submitted through product or written customer instruction. |
| Data categories | Request type, details, requester email, status, due date, response summary. |
| Data subjects | Requesters and users whose account/workflow data is in scope. |
| Subprocessors | Supabase, email provider where notifications are sent. |
| Third-country transfers | Depends on email provider configuration; DPA/SCCs required where applicable. |
| Retention | Request records per compliance retention policy unless hard deletion applies. |
| Security measures | Timestamped request intake, processing restriction flag, machine-readable export, account deletion flow. |

## Subprocessors

The current subprocessor registry is maintained in:

- `SUBPROCESSORS.md`
- `/subprocessors`

## Review Cadence

Review quarterly, when onboarding subprocessors, when adding connector categories, when changing LLM providers, and after any security incident.
