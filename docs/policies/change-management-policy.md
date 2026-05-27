# Corelyx Change Management Policy

**Status:** Approved internal policy, pre-certification evidence  
**Owner:** Corelyx responsible person / founder  
**Approved:** 2026-05-27  
**Review cadence:** Annual

## Purpose

Ensure production changes are reviewed, traceable, reversible, and tested in proportion to risk.

## Change Types

| Type | Examples | Minimum control |
|---|---|---|
| Standard | Low-risk copy, documentation, dependency patch with tests | Pull request or tracked commit, basic verification. |
| Normal | Product, runtime, schema, billing, auth, compliance, or database changes | Pull request, tests or explicit test rationale, rollout/rollback note. |
| Emergency | Urgent security, outage, or data-integrity fix | Document reason, approve by responsible person, retrospective review within 2 business days. |

## Requirements

- Production code changes are made through Git and reviewed before merge where practical.
- Database migrations must be additive where possible and include rollback/mitigation notes for risky changes.
- Schema, connector, trigger, and runtime translation changes require focused tests.
- Security-sensitive changes must preserve server-side credential handling and avoid logging secrets.
- Releases should include a concise changelog or PR summary with risk, validation, and rollback notes.

## Evidence

Git history, pull requests, test results, deployment records, and incident/change tickets are evidence for ISO 27001, ISO 27017, and ISO 20000-1 preparation.
