# Corelyx — EU Compliance Plan
**Version:** 1.0  
**Last updated:** April 2026  
**Applies to:** All engineers, backend, infrastructure, and product contributors  
**Owner:** Founding team / designated DPO (to be appointed)

> ⚠️ **Legal disclaimer:** This document is an internal engineering and product reference, not legal advice. Before publishing any compliance claims externally (website, marketing, contracts), have a qualified Austrian/EU data protection lawyer review the specific language. Incorrect compliance claims are a liability with the exact enterprise buyers you are targeting.

---

## Table of Contents

1. [Why This Exists](#1-why-this-exists)
2. [Regulations Overview](#2-regulations-overview)
3. [GDPR — Full Technical Specification](#3-gdpr--full-technical-specification)
4. [EU AI Act — Full Technical Specification](#4-eu-ai-act--full-technical-specification)
5. [NIS2 Directive — Full Technical Specification](#5-nis2-directive--full-technical-specification)
6. [EU Data Act — Full Technical Specification](#6-eu-data-act--full-technical-specification)
7. [US CLOUD Act — Why It Matters for Infrastructure Decisions](#7-us-cloud-act--why-it-matters-for-infrastructure-decisions)
8. [Corelyx Architecture — Compliance Mapping](#8-corelyx-architecture--compliance-mapping)
9. [LLM & AI Pipeline Compliance](#9-llm--ai-pipeline-compliance)
10. [Developer Implementation Checklist](#10-developer-implementation-checklist)
11. [Data Flow Diagrams](#11-data-flow-diagrams)
12. [Required Legal Documents](#12-required-legal-documents)
13. [Incident Response Protocol](#13-incident-response-protocol)
14. [Subprocessor Registry](#14-subprocessor-registry)
15. [Compliance Timeline & Deadlines](#15-compliance-timeline--deadlines)
16. [Open Questions & Risks](#16-open-questions--risks)

---

## 1. Why This Exists

Corelyx is positioning as an EU-native AI workflow automation platform. This is a genuine competitive differentiator against US tools like Zapier (subject to US CLOUD Act even with EU data residency) and requires our architecture, data handling, and product features to be provably compliant — not just claimed to be.

EU enterprise and mid-market buyers — especially in DACH, Benelux, and regulated industries — will ask for:
- A signed Data Processing Agreement (DPA) before any contract
- Evidence of EU data residency
- Documentation of subprocessors
- An answer to "are you EU AI Act ready?"
- ISO 27001 or equivalent security posture evidence

Being able to answer all of these with documentation, not just assurances, is a revenue enabler. It is also legally required.

**Who needs to read this:**
- Backend engineers — data handling, encryption, logging, deletion APIs
- Infrastructure engineers — hosting, data residency, network architecture
- Product — feature decisions that affect compliance (retention, export, approvals)
- Founding team — legal documents, DPA, vendor selection

---

## 2. Regulations Overview

| Regulation | In Force | Max Fine | Scope | Our Role |
|---|---|---|---|---|
| **GDPR** | May 2018 | €20M or 4% global turnover | Any processing of EU residents' personal data | Data Processor (for customers) + Data Controller (for our own user data) |
| **EU AI Act** | Aug 2024 (phased) | €35M or 7% global turnover | AI systems deployed in/to EU market | Deployer of GPAI (LLMs), potential Provider of AI system |
| **NIS2** | Oct 2024 | €10M or 2% global turnover | Digital service providers, SaaS platforms | Digital service provider |
| **EU Data Act** | Sep 2025 | TBD (civil enforcement) | All connected digital services | SaaS provider subject to portability requirements |
| **US CLOUD Act** | (US law, not EU) | N/A — affects US-incorporated vendors | US companies storing data anywhere globally | Informs our infrastructure choices — we must be EU-incorporated and EU-hosted |

---

## 3. GDPR — Full Technical Specification

### 3.1 What GDPR Covers in Our Context

GDPR applies whenever personal data of EU residents is processed. Personal data includes: names, email addresses, IP addresses, user IDs, behavioral data, workflow execution logs that contain any identifiable information about real people, API tokens linked to individuals, and any data that can be combined to identify a person.

In Corelyx, personal data flows through:
- User accounts (name, email, password hash)
- Workflow execution logs (which may contain customer data passed through nodes)
- Connector credentials (OAuth tokens linked to individual accounts)
- API keys stored server-side
- Any data fetched from connected tools (Gmail, HubSpot contacts, etc.)

### 3.2 Our Dual Role

**As a Data Controller** (we decide why and how data is processed):
- Our own users' account data
- Billing information
- Marketing and analytics data about our users
- Support ticket data

**As a Data Processor** (we process data on behalf of our customers):
- All workflow execution data
- Data fetched from customers' connected apps
- Execution logs and payloads
- Credentials stored for workflow use

This distinction matters because it creates different legal obligations and documentation requirements. We need a RoPA (Record of Processing Activities) entry for every category in both roles.

### 3.3 The Seven GDPR Principles — Technical Implementation

#### Principle 1: Lawfulness, Fairness, Transparency
**What it means:** Every processing activity must have a legal basis. The six legal bases are: consent, contract, legal obligation, vital interests, public task, and legitimate interests.

**For Corelyx:**
- Processing user account data: **Contract** (necessary to provide the service)
- Processing analytics on our platform usage: **Legitimate interests** (must be documented)
- Marketing emails: **Consent** (explicit opt-in required)
- Workflow execution logs: **Contract** (necessary to provide the service, with retention limits)

**Technical requirement:** Every data collection point in the product must have a documented legal basis. Build a legal basis register alongside the RoPA.

#### Principle 2: Purpose Limitation
**What it means:** Data collected for one purpose cannot be used for another.

**For Corelyx:**
- Execution logs collected for debugging cannot be used for product analytics without separate legal basis
- Email addresses collected for account creation cannot be used for marketing without consent
- Workflow payloads processed for execution cannot be stored indefinitely for ML training without explicit consent and separate legal basis

**Technical requirement:** Tag data at ingestion with its purpose. Do not allow cross-purpose data access without a documented legal basis review.

#### Principle 3: Data Minimization
**What it means:** Only collect what is strictly necessary.

**For Corelyx technical requirements:**
- Execution log payloads: only log what is necessary for debugging. Do NOT log full API response bodies by default — they often contain personal data from third-party systems.
- Offer configurable log verbosity: `NONE | ERRORS_ONLY | METADATA_ONLY | FULL` — default to `METADATA_ONLY`
- Connector credential storage: store tokens, not underlying account data. Never cache more than needed.
- Analytics: use anonymized/aggregated data where possible. Do not track user behavior at PII level unless strictly necessary and documented.

#### Principle 4: Accuracy
**Technical requirement:**
- Provide users with a self-service profile update UI
- Propagate updates across all systems (do not have stale copies in caches)
- Do not indefinitely cache user data pulled from connected apps

#### Principle 5: Storage Limitation
**What it means:** Do not keep data longer than necessary.

**For Corelyx:**

| Data Type | Recommended Retention | Justification |
|---|---|---|
| Workflow execution logs (metadata only) | 90 days | Operational debugging |
| Workflow execution logs (full payload) | 30 days max, or user-configurable | Minimize personal data exposure |
| User account data | Duration of contract + 30 days post-deletion | Contract |
| Billing records | 7 years | Austrian/EU tax law requirement |
| OAuth tokens | Until revoked or workflow deleted | Operational necessity |
| Support tickets | 2 years | Legitimate interest |
| Marketing consent records | Until consent withdrawn + 3 years | Legal defense |

**Technical requirement:**
- Build automated data retention jobs. Do NOT rely on manual deletion.
- Implement `scheduled_deletion` flags on data at write time based on retention policy
- Run a nightly/weekly purge job across all data stores
- Log all deletions to a separate audit log (ironic but required — the deletion log must also have its own retention policy)

#### Principle 6: Integrity and Confidentiality (Security)
See [Section 5 (NIS2)](#5-nis2-directive--full-technical-specification) for full security requirements. GDPR Article 32 requires "appropriate technical and organizational measures."

**Minimum technical requirements:**
- Encryption in transit: TLS 1.2 minimum, TLS 1.3 preferred, for all data in motion
- Encryption at rest: AES-256 for all databases and file storage
- Secrets: server-side only, never returned to frontend, never logged in plaintext
- Access control: role-based, least-privilege principle
- Multi-factor authentication: required for admin access
- Penetration testing: at least annually

#### Principle 7: Accountability
**What it means:** You must be able to PROVE compliance, not just claim it.

**Technical requirement:**
- Maintain all compliance documentation in a version-controlled internal system (this file is part of that)
- Keep a log of DPIAs conducted, DPAs signed, consent records, deletion requests fulfilled
- Appoint a Data Protection Officer (DPO) or at minimum a designated compliance contact

---

### 3.4 Article 25 — Privacy by Design and Default

This is where Corelyx has a genuine architectural advantage. Privacy by design means:

- **Default settings must be the most privacy-protective.** Log verbosity defaults to metadata-only. Data retention defaults to the shortest period. Sharing defaults to off.
- **Personal data must be protected at every stage of the data lifecycle** — collection, storage, processing, transmission, and deletion.
- **Pseudonymization** should be applied where possible: replace personal identifiers in logs with internal IDs that only map back to real identities through a separate lookup table.

**Technical implementation:**
```
Execution log structure (compliant):
{
  "execution_id": "exec_abc123",       // internal ID, not user's email
  "workflow_id": "wf_xyz789",
  "user_ref": "usr_ref_0001",          // pseudonymized reference
  "timestamp": "2026-04-28T10:00:00Z",
  "status": "completed",
  "node_count": 5,
  "duration_ms": 1240,
  "error": null
  // NO: full payload, no email addresses, no customer data inline
}
```

Payload data (which may contain personal data) should be stored separately, with its own retention policy, and linked by execution_id. This allows the audit metadata to be kept longer than the payload.

---

### 3.5 Article 28 — Data Processing Agreements (DPA)

**Required:** Before any customer uses Corelyx to process their users' personal data, a DPA must be signed.

**What the DPA must contain:**
- Subject matter and duration of processing
- Nature and purpose of processing
- Type of personal data and categories of data subjects
- Obligations and rights of the controller (customer)
- List of all subprocessors
- Obligation that subprocessors meet equivalent standards
- Instructions that Corelyx will only process data per customer instructions
- Security measures (reference Article 32)
- Breach notification obligations (72 hours to controller, then controller notifies regulator)
- Data deletion / return upon contract termination
- Audit rights for the customer

**Action:** Have an Austrian/EU lawyer draft a standard DPA template. Make it available on your website and send it proactively to enterprise customers before they ask.

---

### 3.6 Article 30 — Record of Processing Activities (RoPA)

**Required for:** All organizations that regularly process personal data (yes, this includes startups).

The RoPA is the first document a Data Protection Authority (DPA) will ask for in an audit. Corelyx must maintain one as a Controller AND one as a Processor.

**Controller RoPA — minimum fields per processing activity:**

| Field | Example for Corelyx |
|---|---|
| Activity name | User account management |
| Controller name and contact | Corelyx GmbH, [address] |
| DPO contact | [if appointed] |
| Processing purpose | Provide SaaS platform access |
| Legal basis | Article 6(1)(b) — contract |
| Data subject categories | Platform users (employees of customer companies) |
| Personal data categories | Name, email address, hashed password, usage logs |
| Recipients / subprocessors | Supabase (DB), [hosting provider], [email provider] |
| Third country transfers | None — all EU hosted |
| Retention period | Duration of contract + 30 days |
| Security measures | TLS 1.3, AES-256, RBAC, MFA |

**Processor RoPA — minimum fields per processing activity:**

| Field | Example |
|---|---|
| Controller name | [Customer company name] |
| Processing categories | Workflow execution of customer-defined automation |
| Data categories processed | Varies by customer workflow — may include contact data, email content, CRM records |
| Subprocessors | [LLM provider], Supabase, [hosting] |
| Third country transfers | None — EU only |
| Security measures | Server-side secrets, TLS, AES-256 |

**Technical requirement:** Build an internal admin tool or use a structured database table to maintain the RoPA. It must be updateable. Keep version history. Export to PDF for regulatory requests.

---

### 3.7 Article 32 — Security of Processing

Minimum required technical measures for GDPR compliance:

```
ENCRYPTION:
  ✓ TLS 1.3 for all data in transit (API, web, internal services)
  ✓ AES-256 encryption at rest for all databases
  ✓ Encrypted backup storage
  ✓ Encrypted secrets storage (never plaintext in DB or logs)

ACCESS CONTROL:
  ✓ Role-based access control (RBAC) — users can only access their own org's data
  ✓ Least-privilege principle for internal service accounts
  ✓ MFA required for admin dashboard and any privileged access
  ✓ Session tokens expire (max 24h idle, 7 days absolute)
  ✓ Audit log of all admin actions

ISOLATION:
  ✓ Tenant data isolation — one customer cannot access another's data
  ✓ Separate encryption keys per tenant (where feasible)
  ✓ Database-level row isolation or separate schemas per tenant

SECRETS MANAGEMENT:
  ✓ OAuth tokens stored server-side only
  ✓ API keys stored encrypted, never returned to frontend after initial save
  ✓ Secrets never appear in execution logs
  ✓ Secrets never passed through LLM prompt context
```

---

### 3.8 Article 33 & 34 — Breach Notification

**Timeline:**
- **72 hours** after becoming aware of a breach → notify the relevant supervisory authority (in Austria: Datenschutzbehörde)
- If high risk to individuals → also notify affected individuals "without undue delay"

**What counts as a breach:** Unauthorized access, accidental deletion, ransomware, exposure of personal data in logs, accidental cross-tenant data leak.

**Technical requirement:**
- Maintain a breach register (even for non-reportable incidents)
- Implement monitoring and alerting that can detect anomalous data access
- Document the incident response process (see [Section 13](#13-incident-response-protocol))

---

### 3.9 Article 35 — Data Protection Impact Assessment (DPIA)

**Required when:** Processing is "likely to result in a high risk to the rights and freedoms of natural persons." Triggers include: systematic processing of personal data at scale, automated decision-making with significant effects, processing of special category data.

**For Corelyx:** A DPIA should be conducted for:
- The AI workflow generation feature (AI making decisions about data flows)
- Any workflow template that processes special category data (health, finance, HR)
- The approval gate system (to document that human oversight mitigates risk)

A DPIA template must be available for customers to use — they need to conduct their own DPIAs for high-risk workflows they build on Corelyx, and your documentation supports that.

---

### 3.10 Data Subject Rights — Technical Requirements

| Right | Trigger | Timeframe | Technical Implementation Required |
|---|---|---|---|
| Access (Art. 15) | User requests copy of their data | 30 days | Data export API — pull all data across all stores for a given user_id |
| Rectification (Art. 16) | User requests correction | 30 days | Self-service profile edit + propagation across caches |
| Erasure (Art. 17) | User requests deletion | 30 days | Hard delete across DB, logs, backups, subprocessors notified |
| Restriction (Art. 18) | User disputes accuracy or objects | Immediate flag, resolve within 30 days | `processing_restricted` flag on user record |
| Portability (Art. 20) | User wants their data | 30 days | Machine-readable export (JSON/CSV) of all user data |
| Object (Art. 21) | User objects to processing | Stop processing immediately | Processing halt mechanism, especially for marketing |

**Technical requirement:** Build a `/api/user/data-request` endpoint that accepts DSR (Data Subject Request) types and queues them for processing. Log all requests and responses with timestamps for accountability.

---

## 4. EU AI Act — Full Technical Specification

### 4.1 Background and Timeline

The EU AI Act is the world's first comprehensive legal framework for AI. It uses a **risk-based tiered approach** — the higher the risk of an AI system, the stricter the requirements.

**Enforcement timeline (current as of April 2026):**

| Date | What Applies |
|---|---|
| 2 February 2025 ✅ | Prohibited AI practices banned. AI literacy obligations begin. |
| 2 August 2025 ✅ | GPAI model obligations in effect. Governance infrastructure operational. Penalty regime active. |
| **2 August 2026** ⬅️ **UPCOMING** | High-risk AI system requirements fully enforceable. Most critical deadline for most companies. |
| 2 August 2027 | Requirements for AI in safety components of regulated products. |

**Penalties (active since August 2025):**
- Prohibited AI violations: **€35 million or 7% of global annual turnover**
- Other obligations: **€15 million or 3% of global annual turnover**
- Incorrect information to authorities: **€7.5 million or 1%**

---

### 4.2 Risk Tiers — Where Corelyx Features Fall

#### Tier 1: UNACCEPTABLE RISK — Prohibited (banned since Feb 2025)
These must NEVER be features or use cases of Corelyx:
- Subliminal manipulation of user behavior
- Social scoring systems
- Real-time biometric identification in public spaces
- Emotion recognition in workplace contexts
- Predictive policing

**Action:** Add to Terms of Service that these use cases are explicitly prohibited on the platform.

#### Tier 2: HIGH RISK — Regulated from August 2026
High-risk AI systems require conformity assessments, technical documentation, human oversight, data governance, and registration in an EU database before being placed on the market.

Corelyx becomes implicated in high-risk AI when customers use it to automate:
- **Employment decisions** — screening CVs, scheduling interviews, performance evaluation
- **Credit decisions** — loan processing, creditworthiness assessment
- **Education** — student assessment, admission decisions
- **Healthcare** — any clinical decision support
- **Critical infrastructure** — energy, water, transport management

**Action required:**
- Add detection or at minimum Terms of Service prohibitions for unreviewed high-risk use cases
- For known high-risk use cases, require human approval gate to be active in the workflow
- Provide DPIA templates for customers building these workflows
- Document your role as a general-purpose tool vs. the customer's role as deployer of a high-risk system

#### Tier 3: LIMITED RISK — Transparency obligations
If Corelyx has any AI assistant interface or chatbot for building workflows, it must be disclosed as AI. Any AI-generated content must be marked as such.

**Technical requirement:**
- Label AI-generated workflow graphs as "AI-generated — review before running"
- If adding any conversational AI interface, display "You are interacting with an AI system"

#### Tier 4: MINIMAL RISK — Unregulated
Most Corelyx workflow automation features (non-AI steps, connectors, scheduling) fall here.

---

### 4.3 Corelyx's Role Under the AI Act

**As a Deployer of GPAI (General Purpose AI Models):**
When Corelyx sends prompts to Claude, GPT-4, or other LLMs to generate workflow graphs, we are a **deployer** of a GPAI model. As of August 2025, this means:

Required actions:
- Maintain an internal **AI system inventory** documenting which models we use
- Document the **purpose** of each AI system (graph generation, workflow description parsing, etc.)
- Implement **human oversight** before AI-generated outputs affect real systems (already done via inspect-graph step)
- Ensure AI-generated outputs are **labeled** as AI-generated
- Do not use AI in ways that trigger high-risk classification without conducting appropriate assessments
- Maintain **logs of AI system use** that are auditable

**If Corelyx fine-tunes or modifies LLMs:**
We would then become a **provider** under the AI Act, triggering significantly heavier obligations including technical documentation, conformity assessment, and EU database registration.

**Recommendation:** Remain a deployer. Do not fine-tune models unless you have a dedicated compliance function.

---

### 4.4 Human Oversight Requirement — Our Core Feature

The EU AI Act explicitly requires that high-risk AI systems allow humans to oversee, understand, and intervene. Article 14 states:

> "High-risk AI systems shall be designed and developed in such a way, including with appropriate human-machine interface tools, that they can be effectively overseen by natural persons."

**Corelyx's approval gate feature directly satisfies this requirement.** This is not marketing language — it is a literal architectural alignment with a legal mandate.

**Technical requirements to make this defensible:**
- Approval gates must be mandatory (not optional) for any workflow touching sensitive data categories
- The approving human must be able to see the full execution plan before approving
- Approval actions must be logged with: who approved, when, what they saw at time of approval
- Approval must not be bypassable programmatically (no API endpoint that skips approval)
- Timeout behavior: if approval is not given within X hours, the workflow must fail-safe (stop, not proceed)

---

### 4.5 AI Literacy Obligation (Active since February 2025)

All companies using AI must ensure their staff have appropriate AI literacy. For Corelyx as a platform, this means:
- Providing documentation and guides that help customers understand what the AI does and does not do
- Being clear about the limitations of AI-generated workflow graphs
- Not overstating AI accuracy or reliability in marketing

**Technical product requirement:** The AI-generated graph must come with a confidence/review prompt, not just an "it's done" message. Something like: "Corelyx generated this workflow from your description. Review each node carefully before activating."

---

### 4.6 GPAI Technical Documentation Requirements

Since August 2025, if you are building on top of GPAI models, you should document:

```
AI_SYSTEM_INVENTORY.md (internal document):

System: Workflow Graph Generator
Model used: [e.g. Claude claude-sonnet-4-5 via Anthropic API]
Provider: Anthropic PBC
Purpose: Convert plain-English workflow descriptions into structured execution graphs
Risk classification: Minimal risk (general-purpose tool, no automated decisions affecting individuals)
Human oversight mechanism: User must inspect and approve graph before execution
Data sent to model: User's workflow description text only
Personal data in prompts: Must be ZERO — see Section 9
Logging: Prompt sent + graph received logged for 30 days, then purged
EU data processing: Anthropic API processes data on US infrastructure — see mitigation in Section 9
```

---

## 5. NIS2 Directive — Full Technical Specification

### 5.1 What NIS2 Is

The Network and Information Security Directive 2 (NIS2) replaced the original NIS Directive in October 2024. It massively expanded scope — now covering SaaS platforms and digital service providers even if they don't consider themselves "critical infrastructure."

**Does NIS2 apply to Corelyx?** Yes, as a digital service provider (cloud computing service / online platform). Additionally, if our customers are in essential or important sectors, their use of Corelyx is part of their supply chain security assessment — and we will be evaluated.

### 5.2 Required Security Measures (Article 21)

NIS2 requires "appropriate and proportionate technical, operational and organisational measures." For a SaaS platform, this means:

#### Risk Management
```
Required:
✓ Written information security policy
✓ Risk assessment methodology documented and conducted annually
✓ Risk register maintained with mitigations
✓ Security roles and responsibilities assigned
```

#### Incident Handling
```
Required:
✓ Incident detection capability (monitoring, alerting)
✓ Incident response plan documented and tested
✓ 24-hour early warning to authorities for significant incidents
✓ 72-hour full notification with initial assessment
✓ Final report within 1 month
✓ Incident log maintained
```

Note: NIS2's 24-hour early warning is faster than GDPR's 72-hour breach notification. If an incident is both a NIS2 incident and a GDPR breach, the 24-hour timeline controls.

#### Business Continuity
```
Required:
✓ Backup strategy: automated, tested, geographically redundant, EU-only
✓ Recovery Time Objective (RTO) defined — recommend: 4 hours for critical systems
✓ Recovery Point Objective (RPO) defined — recommend: 1 hour max data loss
✓ Disaster recovery plan documented
✓ Annually test recovery procedure
```

#### Supply Chain Security
```
Required:
✓ Vendor/subprocessor risk assessment before onboarding
✓ Security requirements in all vendor contracts
✓ Ongoing monitoring of critical vendors
✓ Maintain list of all vendors with access to systems or customer data
```

#### Access Control and Authentication
```
Required:
✓ MFA on all privileged accounts (mandatory)
✓ MFA on all user accounts (strongly recommended, make default)
✓ Privileged Access Management (PAM) for infrastructure
✓ Access reviews conducted quarterly
✓ Immediate deprovisioning on employee departure
✓ Zero-trust network architecture (recommended)
```

#### Cryptography
```
Required:
✓ Encryption policy defining approved algorithms
✓ TLS 1.2 minimum (TLS 1.3 strongly preferred)
✓ AES-256 for data at rest
✓ RSA-2048 or ECDSA P-256 minimum for key exchange
✓ No deprecated algorithms: no MD5, SHA-1, DES, RC4, TLS 1.0/1.1
✓ Certificate rotation policy (max 1 year, automate with Let's Encrypt or equivalent)
✓ Secrets rotation policy for API keys and database credentials
```

#### Vulnerability Management
```
Required:
✓ Dependency scanning in CI/CD pipeline (e.g. Dependabot, Snyk)
✓ SAST (static analysis) in CI/CD
✓ Penetration testing: at minimum annually, by independent party
✓ CVE monitoring for all dependencies
✓ Patch SLA: Critical: 24h, High: 7 days, Medium: 30 days, Low: 90 days
✓ Vulnerability disclosure policy published
```

#### Logging and Monitoring
```
Required:
✓ Centralized log aggregation (all services log to central store)
✓ Log integrity protection (logs must not be modifiable)
✓ Log retention: minimum 12 months (NIS2 requirement)
✓ Real-time alerting on security events
✓ Anomaly detection for unusual access patterns
✓ Audit log for all privileged actions
```

### 5.3 Governance Requirements

NIS2 also requires organizational measures:
- Management (founders/board) must approve cybersecurity policy and can be held personally liable
- Cybersecurity training for all staff
- Designated security contact/responsible person

---

## 6. EU Data Act — Full Technical Specification

### 6.1 What the Data Act Requires

The EU Data Act came into force September 2025. For SaaS platforms, the core requirements are:

#### Switching Rights
- Customers must be able to switch to a competitor within **2 months** notice
- You must provide full export of all their data in this period
- **No switching charges** from January 2027 onward
- This means: no proprietary formats that lock data in, no delays in exports, no fees for data export

#### Data Portability
- All customer data must be exportable in **machine-readable, interoperable formats**
- Formats: JSON preferred, CSV acceptable, must be documented with schema
- Export must be available via API (not just a manual request process)
- Response time for export requests: reasonable timeframe, 30 days maximum

#### Technical Interoperability
- Open APIs for data access
- API documentation must be publicly available
- Cannot impose technical barriers to switching

### 6.2 Technical Implementation Required

```
DATA EXPORT API:

GET /api/v1/export/workflows
  → Returns all workflows as JSON with full node definitions

GET /api/v1/export/executions
  → Returns all execution history (within retention period) as JSON/CSV

GET /api/v1/export/connectors
  → Returns connector configurations (not secrets) as JSON

GET /api/v1/export/full
  → Initiates async full account export, returns job_id

GET /api/v1/export/status/{job_id}
  → Returns export status and download URL when ready

DELETE /api/v1/account
  → Initiates account deletion with 30-day grace period
  → Triggers deletion of all data within 30 days
  → Sends confirmation email with deletion schedule
```

**Export format requirements:**
- Must include a `schema_version` field
- Must include a `exported_at` timestamp
- Must be self-describing (a developer at a competitor should be able to import it)
- Must not require Corelyx tooling to read

---

## 7. US CLOUD Act — Why It Matters for Infrastructure Decisions

### 7.1 What the CLOUD Act Is

The US Clarifying Lawful Overseas Use of Data (CLOUD Act) of 2018 allows US law enforcement to compel US-incorporated companies to produce data stored anywhere in the world — including in EU data centers — without the data subject's knowledge.

**This means:** A US company (Zapier, Make pre-Celonis, any US SaaS) cannot fully guarantee EU data sovereignty even if they host in Frankfurt. They can be legally ordered to hand data to US authorities.

### 7.2 Why This Is Our Competitive Advantage

Corelyx, as an Austrian GmbH (or Austrian UG), is not subject to the CLOUD Act. EU data stored by an EU-incorporated entity on EU infrastructure is protected by EU law. This is a real, substantive legal difference — not a marketing claim.

**Requirements to maintain this advantage:**
- Corelyx must be incorporated as an EU legal entity (Austrian GmbH/UG/KG)
- All production infrastructure must be in EU regions
- No US-incorporated parent company
- No US-based infrastructure that touches production customer data
- LLM API calls are a significant risk area — see Section 9

### 7.3 Infrastructure Requirements

```
REQUIRED EU REGIONS (pick from):
  ✓ AWS eu-central-1 (Frankfurt)
  ✓ AWS eu-west-1 (Ireland)
  ✓ Hetzner (Nuremberg, Falkenstein, Helsinki) — preferred: EU-owned
  ✓ UpCloud (Helsinki, Frankfurt)
  ✓ Scaleway (Paris, Amsterdam)
  ✓ OVHcloud (Strasbourg, Gravelines)

FORBIDDEN for production customer data:
  ✗ AWS us-east-1, us-west-2, or any US region
  ✗ Any US-based hosting provider for customer data
  ✗ Cloudflare's US data centers for customer data (use EU-only config)

RECOMMENDED:
  → Hetzner Cloud for compute (German company, full EU sovereignty)
  → Supabase with EU region explicitly set
  → Verify every service in your stack: where is data processed?
```

---

## 8. Corelyx Architecture — Compliance Mapping

### 8.1 Data Flow Overview

```
USER BROWSER
    │
    ▼ (TLS 1.3)
CORELYX API (EU-hosted)
    │
    ├──► SUPABASE (EU region) — user data, workflow definitions, credentials (encrypted)
    │
    ├──► WORKFLOW EXECUTION ENGINE (EU-hosted)
    │         │
    │         ├──► CONNECTOR LAYER (EU-hosted)
    │         │         │
    │         │         ├──► Third-party APIs (Gmail, HubSpot, etc.) — data leaves EU here
    │         │         │    ⚠️ This is where customer data flows to third-party systems
    │         │         │    → Must be documented as subprocessors in DPA
    │         │
    │         └──► LLM API (Anthropic/OpenAI — US servers)
    │                   ⚠️ CRITICAL RISK AREA — see Section 9
    │
    ├──► EXECUTION LOGS (EU-hosted, retention-limited)
    │
    └──► AUDIT LOGS (EU-hosted, tamper-evident)
```

### 8.2 Compliance Status Per Feature

| Feature | GDPR | AI Act | NIS2 | Data Act | Notes |
|---|---|---|---|---|---|
| User authentication | ✅ with MFA | N/A | ✅ | N/A | Implement MFA now |
| Credential storage (server-side) | ✅ | N/A | ✅ | N/A | Never return to frontend |
| Workflow execution logs | ⚠️ | N/A | ✅ | ✅ | Need retention limits + PII handling |
| AI graph generation | ⚠️ | ⚠️ | N/A | N/A | PII in prompts is the risk — see Section 9 |
| Approval gates | ✅ | ✅ | N/A | N/A | Satisfies Art. 14 AI Act human oversight |
| Data export API | ⚠️ | N/A | N/A | ⚠️ | Must be built — currently unclear |
| Account deletion | ⚠️ | N/A | N/A | ✅ | Must propagate to all stores |
| Audit trail | ✅ | ✅ | ✅ | N/A | Already a feature — ensure tamper-evident |

---

## 9. LLM & AI Pipeline Compliance

### 9.1 The Core Problem

When Corelyx sends a user's workflow description to an LLM API (Anthropic, OpenAI, etc.), that prompt data is processed on US infrastructure by a US company. If the prompt contains personal data, this is a **cross-border data transfer under GDPR** and must be handled accordingly.

Examples of personal data that could appear in a workflow prompt:
- "Route emails from john.smith@company.com to..."
- "When a new contact named [name] is added to HubSpot..."
- "Send a summary to my manager Sarah at sarah@..."

### 9.2 Mitigations Required

#### Option A: Prompt Sanitization (Minimum Viable)
Before sending any prompt to an LLM API, run it through a PII detection and redaction layer:

```javascript
// Pseudocode — implement with a PII detection library
async function sanitizePromptForLLM(userPrompt: string): Promise<string> {
  const piiPatterns = [
    { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
    { pattern: /\+?[0-9]{8,15}/g, replacement: '[PHONE]' },
    // Add: names (NER), addresses, IBANs, etc.
  ];
  
  let sanitized = userPrompt;
  for (const { pattern, replacement } of piiPatterns) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  return sanitized;
}
```

For production use, use a dedicated PII detection library or service (e.g. Microsoft Presidio, AWS Comprehend, or a local model like GLiNER).

#### Option B: Standard Contractual Clauses (SCCs)
Anthropic and OpenAI both offer Data Processing Agreements with Standard Contractual Clauses for EU customers. Signing these provides a legal basis for the data transfer. However, this does not eliminate the CLOUD Act risk for the underlying data.

**Required action:** Sign Anthropic's DPA (and/or OpenAI's DPA) with SCCs before processing any customer data through their APIs.

#### Option C: Local/EU-hosted LLM (Best for compliance claims)
For the strongest possible compliance story, run inference on EU-hosted open source models:
- **Mistral AI** — French company, EU-hosted API available
- **Self-hosted Llama / Mistral** on Hetzner — full data sovereignty
- **Aleph Alpha** — German AI company, EU-native

The tradeoff is model quality and cost. Consider: use EU-hosted LLM for graph generation (where customer data context may flow), use US API only for internal/non-personal-data tasks.

#### Recommended Approach for Corelyx:
1. Implement PII sanitization on all prompts immediately (lowest effort, reduces risk now)
2. Sign DPAs with Anthropic and OpenAI (legal basis for remaining transfers)
3. Evaluate Mistral EU API or self-hosted option for graph generation specifically
4. Document the approach in your AI system inventory

### 9.3 What Must Never Enter an LLM Prompt
```
NEVER send to external LLM APIs:
  ✗ OAuth tokens or API keys
  ✗ Credentials of any kind
  ✗ Full email content from customer's connected Gmail/Outlook
  ✗ CRM record data containing personal information
  ✗ Any data fetched from connected apps during workflow execution

SAFE to send:
  ✓ User's plain-language workflow description (after PII sanitization)
  ✓ Workflow graph structure (node types, connections — no data values)
  ✓ Error messages (sanitized of any data values)
```

---

## 10. Developer Implementation Checklist

### Phase 1 — Pre-Launch (Before first paying customer)

#### Infrastructure
- [ ] Confirm all production infrastructure is in EU regions only
- [ ] Document infrastructure topology with data residency for each service
- [ ] Enable encryption at rest on all databases (Supabase, any object storage)
- [ ] Implement TLS 1.3 on all endpoints (reject TLS 1.0/1.1)
- [ ] Set up centralized logging with 12-month retention
- [ ] Configure automated backups with geo-redundancy (EU only)

#### Authentication & Access
- [ ] Implement MFA for all admin/privileged access
- [ ] Make MFA available (and default-on) for all users
- [ ] Implement session expiry (24h idle, 7d absolute)
- [ ] Implement RBAC — users cannot access other organizations' data
- [ ] Audit log all privileged admin actions

#### Data Handling
- [ ] Implement configurable execution log verbosity (default: METADATA_ONLY)
- [ ] Ensure execution log payloads do not store credential values
- [ ] Implement automated data retention/purge jobs with the retention periods in Section 3.3
- [ ] Implement PII sanitization for all LLM prompts
- [ ] Ensure OAuth tokens are never returned to frontend after initial save
- [ ] Implement tenant isolation verification (test: can user A access user B's data?)

#### Legal Documents (coordinate with lawyer)
- [ ] Privacy Policy (controller role)
- [ ] Terms of Service (including prohibited use cases: CLOUD Act-adjacent, high-risk AI without approval gates, prohibited AI practices)
- [ ] Data Processing Agreement template (processor role)
- [ ] Cookie Policy + Consent banner
- [ ] Impressum (required under Austrian/German law)
- [ ] Sign Anthropic DPA with SCCs
- [ ] Sign subprocessor DPAs for all services

#### Documentation
- [ ] Create RoPA (Controller) — see Section 3.6 template
- [ ] Create RoPA (Processor) — see Section 3.6 template  
- [ ] Create Subprocessor list (public-facing) — see Section 14
- [ ] Create internal AI System Inventory — see Section 4.6
- [ ] Create Security policy document

### Phase 2 — First 3 Months Post-Launch

#### Data Subject Rights
- [ ] Build `/api/user/data-request` endpoint for DSR handling
- [ ] Build full account data export (JSON) — all data across all stores
- [ ] Build hard account deletion with propagation to all subprocessors
- [ ] Build data portability export (machine-readable, documented schema)
- [ ] Build processing restriction flag mechanism
- [ ] Log all DSR requests with timestamps

#### AI Act Compliance
- [ ] Add "AI-generated — review before activating" label to all generated graphs
- [ ] Implement approval gate bypass prevention (no API shortcut around approval)
- [ ] Log approval actions: who, when, what they reviewed
- [ ] Implement approval timeout fail-safe behavior
- [ ] Add prohibited use cases to Terms of Service
- [ ] Create internal DPIA template for customers building high-risk workflows

#### Security
- [ ] Run first penetration test (internal or external)
- [ ] Implement dependency scanning in CI/CD
- [ ] Implement SAST in CI/CD
- [ ] Create vulnerability disclosure policy (public)
- [ ] Create incident response plan (see Section 13)
- [ ] Set up security monitoring and alerting

### Phase 3 — 6-12 Months

#### Certifications
- [ ] Begin ISO 27001 certification process (required for enterprise sales in DACH)
- [ ] Consider SOC 2 Type II (for international enterprise)

#### Advanced Compliance
- [ ] Evaluate EU-hosted LLM for graph generation
- [ ] Implement full DPIA process for customer workflows with high-risk use cases
- [ ] Build compliance dashboard for customers (audit logs, GDPR controls visible)
- [ ] Evaluate NIS2 formal assessment

---

## 11. Data Flow Diagrams

### 11.1 Workflow Creation — Data Flows
```
User → [BROWSER] → TLS 1.3 → [CORELYX API] (EU)
                                    │
                              Sanitize prompt
                              (remove PII)
                                    │
                              [LLM API] (US — with DPA/SCCs)
                                    │
                              Receive graph structure
                                    │
                              Store in [SUPABASE] (EU)
                                    │
                              Return graph to user for INSPECTION
                                    │
                              User approves/modifies
                                    │
                              Workflow saved (not yet executed)
```

### 11.2 Workflow Execution — Data Flows
```
TRIGGER (webhook/cron/manual)
    │
[CORELYX EXECUTION ENGINE] (EU)
    │
    ├── Fetch encrypted credentials from [SUPABASE] (EU)
    ├── Decrypt in memory (never write decrypted to disk)
    │
    ├── If APPROVAL GATE present:
    │     → Send notification to approver
    │     → PAUSE execution
    │     → Wait for human approval
    │     → Log approval action
    │     → Continue only if approved within timeout
    │
    ├── Execute nodes sequentially:
    │     │
    │     ├── [CONNECTOR] → Third-party API (Gmail, HubSpot, etc.)
    │     │   ⚠️ Data may leave EU here — document as subprocessors
    │     │
    │     └── [LLM NODE] → If user has AI step:
    │           → Sanitize any data before sending to LLM API
    │           → LLM processes on US infrastructure (DPA required)
    │
    ├── Write execution log to [SUPABASE] (EU)
    │     → Metadata only by default
    │     → Payload separately with shorter retention
    │
    └── Write to tamper-evident AUDIT LOG (EU)
```

### 11.3 Credential Storage — Data Flows
```
USER CONNECTS TOOL (e.g. Gmail OAuth):
    │
OAuth flow → Token received in [CORELYX API] (EU)
    │
Encrypt token with per-tenant key (AES-256)
    │
Store encrypted token in [SUPABASE] (EU)
    │
Return ONLY a token reference ID to frontend (never the token itself)
    │
At execution time:
    → Fetch encrypted token from DB
    → Decrypt in memory on execution engine
    → Use for API call
    → Never write decrypted token to logs or return to any client
```

---

## 12. Required Legal Documents

### 12.1 Documents Needed and Status

| Document | Status | Owner | Notes |
|---|---|---|---|
| Privacy Policy | ❌ Not done | Legal + Founder | Must cover controller and processor roles |
| Terms of Service | ❌ Not done | Legal + Founder | Include prohibited use cases |
| Data Processing Agreement (DPA) | ❌ Not done | Legal | Standard template for all customers |
| Cookie Policy | ❌ Not done | Legal | Required for website |
| Impressum | ❌ Not done | Founder | Required by Austrian/German law |
| Subprocessor List | ❌ Not done | Engineering | Public-facing list, must update with 30d notice |
| Anthropic DPA / SCCs | ❌ Not done | Founder | Required before using API with customer data |
| Supabase DPA | ❌ Not done | Founder | Check their EU DPA terms |
| Employee NDA + Data Handling Policy | ❌ Not done | Founder | Internal |

### 12.2 DPA Key Clauses Checklist

When your lawyer drafts the DPA, ensure it includes:
- [ ] Subject matter, duration, nature, purpose of processing
- [ ] Types of personal data and categories of data subjects
- [ ] Full list of subprocessors (by reference to public subprocessor page)
- [ ] 30-day advance notice for subprocessor changes
- [ ] Processing only on documented customer instructions
- [ ] Obligation to notify customer of breach within 24 hours (to give them time to meet their 72h GDPR obligation)
- [ ] Data deletion/return within 30 days of contract end
- [ ] Right of customer to audit (or accept third-party audit reports)
- [ ] Compliance with Article 32 security requirements
- [ ] EU data residency guarantee
- [ ] Standard Contractual Clauses for any transfers outside EU (e.g. LLM APIs)

---

## 13. Incident Response Protocol

### 13.1 Definitions

| Term | Definition |
|---|---|
| Security Incident | Any event that compromises or threatens the confidentiality, integrity, or availability of systems or data |
| Personal Data Breach | A security incident resulting in accidental or unlawful destruction, loss, alteration, or unauthorized disclosure/access to personal data |
| Notifiable Breach | A personal data breach that is "likely to result in a risk to the rights and freedoms of natural persons" |
| High-Risk Breach | A breach "likely to result in a HIGH risk" — requires notifying affected individuals |

### 13.2 Response Timeline

```
0h — DETECTION
    │
    ▼
1h — CONTAINMENT
    → Isolate affected systems
    → Preserve evidence (do NOT delete logs)
    → Notify internal security contact
    │
    ▼
4h — INITIAL ASSESSMENT
    → Determine: is personal data involved?
    → Determine: scope of data affected
    → Determine: is this a notifiable breach?
    → Notify DPO / founding team
    │
    ▼ (if notifiable)
24h — NIS2 EARLY WARNING
    → Notify national CSIRT (Austria: CERT.at)
    → Preliminary notification (can be incomplete at this stage)
    │
    ▼ (if personal data breach)
72h — GDPR BREACH NOTIFICATION
    → Notify Datenschutzbehörde (Austrian DPA)
    → Required information:
        - Nature of the breach
        - Categories and approximate number of individuals affected
        - Categories and approximate number of records affected
        - Name and contact of DPO
        - Likely consequences
        - Measures taken or proposed
    │
    ▼ (if high-risk breach)
ASAP — NOTIFY AFFECTED INDIVIDUALS
    → Email to affected users
    → Plain language description of what happened
    → What data was affected
    → What they should do
    → What Corelyx is doing
    │
    ▼
30 DAYS — NIS2 FINAL REPORT
    → Detailed incident report to authorities
    → Root cause analysis
    → Remediation measures implemented
```

### 13.3 Breach Register

Maintain a breach register for ALL incidents, even non-reportable ones:

| Field | Description |
|---|---|
| Incident ID | Internal reference |
| Date discovered | |
| Date of incident (if known) | |
| Description | What happened |
| Data affected | Types and approximate count |
| Individuals affected | Approximate number |
| Notifiable? | Yes/No + reasoning |
| Notification dates | If applicable |
| Remediation | Actions taken |
| Lessons learned | |

---

## 14. Subprocessor Registry

### 14.1 What This Is

Every service that processes personal data on our behalf must be listed publicly. When we add or change a subprocessor, we must notify customers with 30 days advance notice.

### 14.2 Current Subprocessors (to be verified and updated)

| Service | Purpose | Data Processed | Location | DPA Signed? |
|---|---|---|---|---|
| Supabase | Database, auth | User data, workflow data, credentials (encrypted) | EU region — TBC | ❌ |
| [Hosting provider] | Compute | All data | EU only | ❌ |
| Anthropic | LLM for graph generation | Sanitized workflow descriptions | USA (SCCs required) | ❌ |
| [Email service] | Transactional email | User email addresses | TBC | ❌ |
| [Analytics] | Platform analytics | Anonymized usage data | EU preferred | ❌ |

**Note:** Every service in this table must have a signed DPA before being used with production customer data. "TBC" items must be resolved before launch.

---

## 15. Compliance Timeline & Deadlines

### Already In Effect (You Must Comply Now)
- ✅ GDPR (since 2018)
- ✅ EU AI Act: Prohibited AI practices (since February 2025)
- ✅ EU AI Act: GPAI model obligations (since August 2025)
- ✅ EU AI Act: Penalty regime active (since August 2025)
- ✅ NIS2 (since October 2024)
- ✅ EU Data Act (since September 2025)

### Upcoming Critical Deadline
- ⬅️ **2 August 2026** — EU AI Act high-risk AI system requirements fully enforceable. If any Corelyx use cases or features touch high-risk categories (employment, credit, healthcare), full conformity assessment and documentation must be complete.

### Recommended Internal Milestones

| Date | Milestone |
|---|---|
| Month 1 | Legal documents drafted (Privacy Policy, ToS, DPA template) |
| Month 1 | All subprocessor DPAs signed |
| Month 1 | EU infrastructure confirmed, documented |
| Month 2 | RoPA (Controller + Processor) completed |
| Month 2 | PII sanitization for LLM prompts implemented |
| Month 2 | Data retention jobs implemented |
| Month 3 | DSR handling endpoints built and tested |
| Month 3 | Incident response plan finalized |
| Month 3 | First security review / pentest |
| Month 6 | ISO 27001 gap assessment |
| Month 12 | ISO 27001 certification target |
| Before Aug 2026 | High-risk AI use case assessment complete |

---

## 16. Open Questions & Risks

| # | Question / Risk | Severity | Owner | Status |
|---|---|---|---|---|
| 1 | Do execution log payloads currently contain personal data? | 🔴 High | Engineering | Investigate immediately |
| 2 | Is Supabase confirmed on EU region? Which exact region? | 🔴 High | Infrastructure | Verify and document |
| 3 | LLM API calls — are sanitization measures in place? | 🔴 High | Engineering | Not yet — build Phase 1 |
| 4 | Are any third-party services currently used on US infrastructure? | 🔴 High | Infrastructure | Full audit needed |
| 5 | Does Anthropic API have a signed DPA/SCCs? | 🟠 Medium | Founder | Required before production use |
| 6 | Is the company incorporated as an EU legal entity? | 🟠 Medium | Founder | Confirm Austrian GmbH/UG status |
| 7 | Who is the designated DPO or compliance contact? | 🟠 Medium | Founder | Assign before launch |
| 8 | Are connected third-party APIs (Gmail, HubSpot, etc.) listed as subprocessors in DPA? | 🟠 Medium | Legal | Must be addressed in DPA template |
| 9 | Approval gate bypass — is there any admin/API path that skips approval? | 🟠 Medium | Engineering | Audit and close if exists |
| 10 | How are tenant encryption keys managed? Are they per-tenant or shared? | 🟡 Low-Medium | Engineering | Design decision needed |
| 11 | Data Act switching compliance — is a data export API on the roadmap? | 🟡 Low-Medium | Product | Add to roadmap |
| 12 | Do we need to register with the Austrian Datenschutzbehörde? | 🟡 Low | Legal | Confirm with lawyer |

---

## Appendix A — Key Contacts & Authorities

| Authority | Role | URL |
|---|---|---|
| Datenschutzbehörde (DSB) | Austrian Data Protection Authority — GDPR supervisory authority | https://www.dsb.gv.at |
| CERT.at | Austrian national CSIRT — NIS2 incident reporting | https://www.cert.at |
| European AI Office | EU AI Act enforcement (GPAI models) | https://digital-strategy.ec.europa.eu/en/policies/ai-office |
| WKO Digital | Austrian business advisory on digital regulations | https://www.wko.at |

## Appendix B — Key Definitions

| Term | Definition |
|---|---|
| **Data Controller** | The entity that determines the purposes and means of processing personal data |
| **Data Processor** | The entity that processes data on behalf of the controller |
| **Subprocessor** | A third party engaged by the processor to process data |
| **DPA** | Data Processing Agreement — mandatory contract between controller and processor |
| **RoPA** | Record of Processing Activities — required under GDPR Art. 30 |
| **DPIA** | Data Protection Impact Assessment — required for high-risk processing |
| **DSR** | Data Subject Request — a request from an individual exercising their GDPR rights |
| **GPAI** | General Purpose AI — foundation models like LLMs |
| **SCC** | Standard Contractual Clauses — legal mechanism for cross-border data transfers |
| **NIS2** | Network and Information Security Directive 2 — EU cybersecurity directive |
| **DPO** | Data Protection Officer — designated compliance role |
| **CSIRT** | Computer Security Incident Response Team |
| **CLOUD Act** | US law enabling law enforcement to compel US companies to produce data stored anywhere |
| **PII** | Personally Identifiable Information |
| **PII Sanitization** | Removing or redacting personal data from content before processing |
| **Tenant Isolation** | Architectural guarantee that one customer cannot access another's data |
| **RTO** | Recovery Time Objective — how quickly systems must be restored after failure |
| **RPO** | Recovery Point Objective — maximum acceptable data loss after failure |

---

*This document should be reviewed and updated whenever: regulations are updated, new services are onboarded, product features change data handling, or after any security incident. Target review cadence: quarterly.*

*Last reviewed by: [Name] on [Date]*
*Approved by: [Founder name]*
