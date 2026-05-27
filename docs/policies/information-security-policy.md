# Corelyx Information Security Policy

**Status:** Approved internal policy, pre-certification evidence  
**Owner:** Corelyx responsible person / founder  
**Approved:** 2026-05-27  
**Review cadence:** Annual, and after material security incidents

## Purpose

Corelyx protects customer workflow schemas, execution metadata, credentials, account data, and audit records with controls appropriate for a small SaaS handling business automation data.

## Scope

This policy applies to the Corelyx web app, runtime, databases, source code, cloud services, endpoints, support processes, and personnel with administrative access.

## Commitments

- Keep credentials server-side and route secret access through approved Vault/token helpers.
- Use least-privilege access and MFA for administrative accounts.
- Encrypt traffic with TLS and rely on managed encryption at rest for cloud storage and databases.
- Minimise sensitive execution logs; store hashes and metadata by default.
- Validate external inputs, webhook payloads, and workflow schemas before processing.
- Maintain a subprocessor registry, supplier reviews, and a data-residency matrix.
- Track risks, incidents, and corrective actions to closure.
- Communicate honestly about certification status and do not display certification badges before third-party certificates exist.

## Objectives

| Objective | Target |
|---|---|
| Access control | Quarterly review of admin access and no shared privileged accounts. |
| Vulnerability management | Critical dependency or application vulnerabilities triaged within 2 business days. |
| Incident response | SEV-1/SEV-2 incidents receive a post-mortem and tracked corrective actions. |
| Logging and retention | Sensitive payloads are minimised by default and deleted under retention controls. |
| Supplier management | Key subprocessors reviewed at least annually. |

## Exceptions

Exceptions require written approval by the responsible person, an expiry date, compensating controls, and entry in the risk register.

## Approval

Approved by the Corelyx responsible person on 2026-05-27. This policy supports ISO 27001 preparation but is not an ISO certificate.
