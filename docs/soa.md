# Corelyx Statement of Applicability

**Standard:** ISO/IEC 27001:2022 Annex A  
**Status:** Pre-certification self-assessment; not an ISO certificate  
**Owner:** Corelyx responsible person / founder  
**Last reviewed:** 2026-05-27  
**Scope:** Corelyx SaaS web app, runtime, database, source control, cloud infrastructure, and support operations

## Summary

All Annex A controls are reviewed below. "Applicable" means the control is relevant to the Corelyx scope. "Planned" means partly implemented and tracked in the risk register or roadmap. "Excluded" means the control does not apply to the current cloud-only, remote-first operating model.

| Control | Name | Applicability | Current evidence / justification |
|---|---|---|---|
| 5.1 | Policies for information security | Applicable | `docs/policies/information-security-policy.md` |
| 5.2 | Information security roles and responsibilities | Applicable | Small-company role mapping in policies and `INCIDENT_RESPONSE.md` |
| 5.3 | Segregation of duties | Planned | Limited by solo-founder stage; high-risk changes require written review notes |
| 5.4 | Management responsibilities | Applicable | Policy owner and management review |
| 5.5 | Contact with authorities | Applicable | `INCIDENT_RESPONSE.md` authority table |
| 5.6 | Contact with special interest groups | Applicable | Security/community sources and provider advisories tracked as needed |
| 5.7 | Threat intelligence | Planned | Dependency/security advisories monitored; formal feed selection pending |
| 5.8 | Information security in project management | Applicable | PR/change process and security review expectations |
| 5.9 | Inventory of information and associated assets | Applicable | `docs/asset-register.md` |
| 5.10 | Acceptable use of information and assets | Applicable | `docs/policies/acceptable-use-policy.md` |
| 5.11 | Return of assets | Applicable | Access removal and device handling in access/environmental policies |
| 5.12 | Classification of information | Applicable | Asset register classification guide |
| 5.13 | Labelling of information | Planned | Classification labels in docs and data-flow reports; formal labels pending |
| 5.14 | Information transfer | Applicable | DPA, subprocessor registry, EU-only controls, internal auth |
| 5.15 | Access control | Applicable | `docs/policies/access-control-policy.md` |
| 5.16 | Identity management | Applicable | Named accounts, MFA, least privilege |
| 5.17 | Authentication information | Applicable | Secrets in Vault/env managers, no secret logging |
| 5.18 | Access rights | Applicable | Quarterly review policy |
| 5.19 | Supplier relationships | Applicable | `docs/policies/supplier-security-policy.md` |
| 5.20 | Supplier agreements | Applicable | DPA/SCC/transfer-basis registry |
| 5.21 | ICT supply chain | Applicable | Dependency and provider review controls |
| 5.22 | Supplier monitoring and change management | Applicable | Annual subprocessor review and Trust Center registry |
| 5.23 | Information security for cloud services | Applicable | `docs/cloud-service-inventory.md`, provider matrix |
| 5.24 | Incident management planning and preparation | Applicable | `INCIDENT_RESPONSE.md` |
| 5.25 | Assessment and decision on events | Applicable | Severity model and breach decision tree |
| 5.26 | Response to incidents | Applicable | Incident playbooks and timelines |
| 5.27 | Learning from incidents | Applicable | Post-mortem template |
| 5.28 | Collection of evidence | Applicable | Evidence preservation instruction in incident runbook |
| 5.29 | Information security during disruption | Applicable | Continuity policy and workflow pause controls |
| 5.30 | ICT readiness for business continuity | Applicable | `docs/policies/business-continuity-policy.md` |
| 5.31 | Legal, statutory, regulatory, contractual requirements | Applicable | Trust Center, DPA, AI Act readiness, privacy pages |
| 5.32 | Intellectual property rights | Applicable | Source code ownership and licensed dependencies tracked in repo |
| 5.33 | Protection of records | Applicable | Audit logs, retention controls, breach register |
| 5.34 | Privacy and protection of PII | Applicable | Privacy policy, DPA, GDPR checks, payload minimisation |
| 5.35 | Independent review of information security | Planned | External pen test/certification roadmap; not yet completed |
| 5.36 | Compliance with policies and standards | Applicable | Policy review cadence and publish checks |
| 5.37 | Documented operating procedures | Applicable | Runbooks, policies, migration/test practices |
| 6.1 | Screening | Planned | Applies before hiring/contracting; currently founder-operated |
| 6.2 | Terms and conditions of employment | Planned | Applies before hiring/contracting |
| 6.3 | Awareness, education and training | Applicable | Founder self-training and policy review; formal training before hires |
| 6.4 | Disciplinary process | Planned | Applies once personnel exist beyond founder |
| 6.5 | Responsibilities after termination/change | Applicable | Access removal policy |
| 6.6 | Confidentiality agreements | Planned | Required for contractors and employees before access |
| 6.7 | Remote working | Applicable | Remote-first operating model and device/security expectations |
| 6.8 | Information security event reporting | Applicable | Incident policy and security contact |
| 7.1 | Physical security perimeters | Excluded | No Corelyx-operated office or data center |
| 7.2 | Physical entry controls | Excluded | Managed cloud providers handle data-center access |
| 7.3 | Securing offices, rooms and facilities | Excluded | No dedicated office facility |
| 7.4 | Physical security monitoring | Excluded | Managed by cloud providers |
| 7.5 | Physical/environmental threats | Excluded | Managed by cloud providers for production systems |
| 7.6 | Working in secure areas | Excluded | No secure physical areas operated by Corelyx |
| 7.7 | Clear desk and clear screen | Applicable | Remote work expectations; no paper records by default |
| 7.8 | Equipment siting and protection | Applicable | Developer device care and encrypted local environment expectation |
| 7.9 | Security of assets off-premises | Applicable | Remote device handling and access control |
| 7.10 | Storage media | Applicable | Minimal removable media use; secure disposal policy |
| 7.11 | Supporting utilities | Excluded | Cloud/data-center provider responsibility |
| 7.12 | Cabling security | Excluded | Cloud/data-center provider responsibility |
| 7.13 | Equipment maintenance | Applicable | Developer hardware maintenance and updates |
| 7.14 | Secure disposal or re-use of equipment | Applicable | Environmental policy and access removal expectations |
| 8.1 | User endpoint devices | Applicable | MFA, secure development devices, no production secrets in files |
| 8.2 | Privileged access rights | Applicable | Named admin access and quarterly review |
| 8.3 | Information access restriction | Applicable | RLS, server-side APIs, workspace access checks |
| 8.4 | Access to source code | Applicable | GitHub MFA/branch protection and repository permissions |
| 8.5 | Secure authentication | Applicable | Supabase Auth, internal service HMAC/shared-secret helpers |
| 8.6 | Capacity management | Planned | Provider usage review before enterprise scale |
| 8.7 | Protection against malware | Applicable | Managed platforms, dependency scanning, endpoint hygiene |
| 8.8 | Management of technical vulnerabilities | Applicable | Dependency triage and security review |
| 8.9 | Configuration management | Applicable | IaC/migrations/env config review and change policy |
| 8.10 | Information deletion | Applicable | Retention function and deletion processes |
| 8.11 | Data masking | Applicable | Redaction, metadata-only logs, hash storage |
| 8.12 | Data leakage prevention | Applicable | Secret redaction, no token frontend responses, transfer checks |
| 8.13 | Information backup | Applicable | Managed Supabase backups and recovery drills |
| 8.14 | Redundancy of information processing facilities | Planned | Provider-managed redundancy; formal HA objectives pending |
| 8.15 | Logging | Applicable | Run/node/app audit logs with retention controls |
| 8.16 | Monitoring activities | Planned | App logs and provider alerts; external uptime monitor pending |
| 8.17 | Clock synchronisation | Applicable | Managed cloud platform clocks |
| 8.18 | Privileged utility programs | Applicable | Admin tools limited by named access |
| 8.19 | Installation of software on operational systems | Applicable | Managed runtime images and reviewed dependencies |
| 8.20 | Network security | Applicable | TLS, internal auth, SSRF protections |
| 8.21 | Security of network services | Applicable | Cloud provider network controls and service auth |
| 8.22 | Segregation of networks | Planned | Provider-managed isolation; explicit environment separation to mature |
| 8.23 | Web filtering | Planned | Applies mainly to endpoint policy; formal control before hiring |
| 8.24 | Use of cryptography | Applicable | TLS, managed encryption at rest, hashed evidence |
| 8.25 | Secure development life cycle | Applicable | Schema validation, tests, code review, security rules |
| 8.26 | Application security requirements | Applicable | GDPR/AI Act checks, credential constraints, input validation |
| 8.27 | Secure system architecture and engineering | Applicable | Server-only secrets, internal auth, RLS, runtime enforcement |
| 8.28 | Secure coding | Applicable | Focused reviews, lint/typecheck/tests, no secret logs |
| 8.29 | Security testing in development and acceptance | Applicable | Unit/integration/security regression tests |
| 8.30 | Outsourced development | Planned | Contractor controls required before outsourcing |
| 8.31 | Separation of development, test and production | Planned | Environment separation exists through config; formal evidence pending |
| 8.32 | Change management | Applicable | `docs/policies/change-management-policy.md` |
| 8.33 | Test information | Applicable | Prefer synthetic/redacted test data |
| 8.34 | Protection during audit testing | Planned | To be defined before external pen test/certification audit |

## ISO 27017 Cloud Extension Notes

| Control | Evidence |
|---|---|
| CLD.6.3.1 Shared responsibility | `docs/shared-responsibility-matrix.md` |
| CLD.8.1.1 Cloud service inventory | `docs/cloud-service-inventory.md` and `docs/asset-register.md` |
| CLD.9.5.1 Cloud admin access | `docs/policies/access-control-policy.md` |
| CLD.9.5.2 Tenant isolation | RLS, workspace access checks, tenant-isolation tests |
