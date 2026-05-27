# Corelyx Shared Responsibility Matrix

**Status:** ISO 27017 preparation evidence  
**Owner:** Corelyx responsible person / founder  
**Last reviewed:** 2026-05-27

| Control area | Corelyx responsibility | Cloud/provider responsibility | Customer responsibility |
|---|---|---|---|
| Account security | Enforce named admin access, MFA, least privilege | Provide IAM/security features | Protect customer workspace accounts and SSO/MFA settings |
| Application security | Secure code, validation, RLS-aware APIs, runtime policy checks | Secure platform services and managed runtime | Configure workflows lawfully and review high-impact automation |
| Data residency | Provide EU-first architecture, EU-only controls for eligible workflows, provider warnings | Offer regional hosting/residency controls where available | Choose eligible regions/providers and avoid non-EEA integrations when required |
| Credentials | Store secret references server-side; never return tokens to frontend | Protect managed secret stores and infrastructure | Maintain provider account security and revoke compromised connections |
| Logging | Minimise sensitive payloads, hash by default, apply retention | Provide platform logs and retention options | Decide whether full payload logging is lawful and necessary |
| Backups | Configure managed backups and recovery procedures | Operate backup infrastructure | Export/retain customer records as needed |
| Incident response | Detect, contain, notify, and remediate Corelyx incidents | Notify Corelyx of provider incidents | Notify Corelyx of compromised customer credentials or unlawful workflow use |
| Supplier governance | Maintain registry, DPA/SCC status, transfer-basis notes | Maintain provider terms and subprocessor disclosures | Review customer-enabled providers and downstream subprocessors |
| AI governance | Provide risk fields, human approval gates, audit logs, documentation exports | Provide model cards/policies where available | Determine AI Act role, use-case classification, legal basis, and required notices |
