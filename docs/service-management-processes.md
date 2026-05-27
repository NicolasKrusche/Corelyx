# Service Management Processes

**Owner:** Corelyx founding team  
**Last reviewed:** 2026-05-27  
**Purpose:** Minimum viable ISO 20000-1 preparation. This is process evidence, not a certification claim.

## Change Management

Every production change should flow through a GitHub pull request using `.github/pull_request_template.md`. The PR records scope, verification, compliance impact, and rollback notes.

## Incident Management

Incidents follow `INCIDENT_RESPONSE.md` and `docs/policies/incident-response-policy.md`. P1 incidents require a post-mortem using `docs/postmortem-template.md`.

## Problem Management

Repeat incidents or systemic defects should be tracked as GitHub issues with a `problem` label. The issue should link related incidents, identify root cause, assign an owner, and record preventive action.

## Release Management

Material production releases should be recorded in `CHANGELOG.md`. Releases that affect database schema, runtime execution, legal copy, security controls, or compliance exports should include rollback notes.

## SLA And Status Management

Current public status page: planned. Until a dedicated status page is live, operational incidents are communicated through support channels. Internal target for enterprise readiness: 99.5% monthly availability and under four-hour first response for P1 incidents.

## Capacity Planning

Review Vercel, Supabase, Railway, Inngest, and Stripe usage monthly. Record plan-limit risks in `docs/risk-register.md` and supplier changes in `docs/asset-register.md`.

## Supplier Management

Review subprocessors at least annually, before adding required providers, and before enabling EU-only mode support for a provider. Missing DPA, SCC, or transfer-basis evidence must be blocked or flagged by workflow checks.
