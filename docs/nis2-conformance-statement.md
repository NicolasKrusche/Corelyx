# Corelyx NIS2 Article 21 Voluntary Conformance Statement

**Status:** Voluntary self-assessment; not a formal certification  
**Owner:** Corelyx responsible person / founder  
**Last reviewed:** 2026-05-27

Corelyx is currently below the general NIS2 size thresholds described in the compliance roadmap. This statement documents voluntary alignment with Article 21 security measures for enterprise-readiness purposes.

| Article 21 measure | Current Corelyx evidence |
|---|---|
| Risk analysis and information system security policies | `docs/risk-register.md`, `docs/policies/information-security-policy.md` |
| Incident handling | `INCIDENT_RESPONSE.md`, `docs/policies/incident-response-policy.md` |
| Business continuity, backup, disaster recovery, crisis management | `docs/policies/business-continuity-policy.md`, managed backups, restore drill requirement |
| Supply chain security | `docs/policies/supplier-security-policy.md`, `/subprocessors`, provider registry |
| Security in network and information systems acquisition/development/maintenance | Change policy, schema validation, tests, secure coding expectations |
| Vulnerability handling and disclosure | `/security` vulnerability disclosure and dependency triage |
| Policies and procedures to assess effectiveness | Management review, tests, future external audit roadmap |
| Basic cyber hygiene and training | Security policies, MFA, least privilege, founder policy review |
| Cryptography and encryption | TLS, managed encryption at rest, hash-based sensitive log evidence |
| Human resources security, access control, asset management | Access control policy, asset register |
| MFA or continuous authentication | MFA required for admin tools where supported |
| Secure emergency communications | Incident runbook authority/customer notification templates |

## Notification Position

If Corelyx experiences a significant incident that meets applicable reporting thresholds, the incident commander assesses CERT.at and GDPR notification duties using `INCIDENT_RESPONSE.md`.
