# Data Protection Impact Assessment (DPIA) Template

**For customers building workflows on Corelyx that process personal data.**
**Status:** Customer-facing template
**Reference:** GDPR Art. 35; AI Act Art. 27 (Fundamental Rights Impact Assessment for high-risk AI deployers)
**Owner of completed DPIA:** the customer (the "controller"). Corelyx is the processor and provides this template as a starting point.

---

## When you need a DPIA

You **must** complete a DPIA before activating a workflow on Corelyx if any of the following are true:

- The workflow processes special-category data (health, biometric, racial/ethnic origin, political opinions, religion, sexual orientation, trade-union membership, or genetic data).
- The workflow makes or assists decisions about people in any **AI Act Annex III** high-risk domain: employment, credit, insurance, education, healthcare, critical infrastructure, law enforcement, migration/border, or administration of justice.
- The workflow processes personal data **at scale** (e.g. systematic monitoring of users, large-volume marketing automation, profiling).
- The workflow involves **automated decision-making with legal or similarly significant effect** on individuals.
- Two or more of the following apply: novel technology, large-scale processing, matching/combining datasets, monitoring publicly accessible areas, processing data of vulnerable individuals.

If none apply, a DPIA is not legally required, but completing this template is still recommended for any workflow that touches personal data.

---

## Section 1 — Workflow identification

| Field | Your answer |
|---|---|
| Workflow name | |
| Corelyx program ID | |
| Owner (controller) name and contact | |
| DPO / privacy lead (if appointed) | |
| Date of this assessment | |
| Workflow status (draft / active / suspended) | |
| Date of next review | |

---

## Section 2 — Description of processing

### 2.1 Purpose

Describe in plain language what the workflow does and **why** it exists. State the business outcome you are trying to achieve.

> *Example: "Triages incoming customer support emails by classifying urgency with an LLM, routing high-urgency tickets to the on-call engineer's Slack, and creating a Notion task for the rest. Goal: reduce time-to-first-response for outage reports."*

### 2.2 Data flow

Describe the data flow node-by-node. For each node, state:

1. The data input (where it came from, what category of personal data).
2. The processing performed (read, transform, send to LLM, write).
3. The data output (where it goes).

> *Example:*
> *1. Trigger: Gmail "new email" event (incoming email contents — name, email address, body text).*
> *2. Agent node: Sends sanitized subject+body to Claude to classify urgency (1-5).*
> *3. Branch node: routes high vs. low urgency.*
> *4. High path: posts to Slack #oncall with redacted summary.*
> *5. Low path: creates Notion task in "Support" database.*

### 2.3 Categories of data subjects

Tick all that apply:

- [ ] Customers / end-users of our service
- [ ] Employees
- [ ] Job applicants
- [ ] Suppliers / business contacts
- [ ] Children (under 16)
- [ ] Vulnerable individuals (patients, refugees, etc.)
- [ ] Members of the public

### 2.4 Categories of personal data

Tick all that apply:

- [ ] Identifiers (name, email, phone, account IDs)
- [ ] Contact data (address, IP)
- [ ] Financial data (payment info, salary)
- [ ] Behavioural data (clickstream, usage logs)
- [ ] Communications content (email body, chat messages)
- [ ] Special-category data — health, biometric, race/ethnicity, religion, sexual orientation, trade-union, political opinions, genetic
- [ ] Criminal-conviction or offence data
- [ ] Children's data
- [ ] Other (specify): ________________________

### 2.5 Volume and frequency

| Question | Your answer |
|---|---|
| Approximate number of data subjects per month | |
| Approximate number of records processed per month | |
| Trigger frequency (cron / event / manual) | |
| Retention of raw inputs in Corelyx logs | METADATA_ONLY default (30d) — see your workspace settings |

---

## Section 3 — Necessity and proportionality

### 3.1 Lawful basis (GDPR Art. 6)

Tick the lawful basis for this processing and explain why it applies:

- [ ] Consent (Art. 6(1)(a)) — and consent is freely given, specific, informed, unambiguous, and withdrawable
- [ ] Contract (Art. 6(1)(b)) — necessary to perform a contract with the data subject
- [ ] Legal obligation (Art. 6(1)(c)) — required by EU or member-state law
- [ ] Vital interests (Art. 6(1)(d))
- [ ] Public task (Art. 6(1)(e))
- [ ] Legitimate interests (Art. 6(1)(f)) — must perform the legitimate-interests balancing test below

If special-category data is involved, also identify the Art. 9 condition (e.g. explicit consent, employment law, vital interests, etc.).

> *Justification:*

### 3.2 Legitimate-interests balancing test (only if Art. 6(1)(f))

| Test | Your answer |
|---|---|
| What is the legitimate interest? | |
| Is the processing necessary to achieve it? | |
| Does it override the data subject's interests, rights, and freedoms? | |
| Has the data subject been informed and given the right to object? | |

### 3.3 Data minimization

For each personal data field flowing through the workflow, justify why it is necessary. Remove fields that aren't strictly needed.

| Field | Why it is necessary | Could it be removed or pseudonymized? |
|---|---|---|
| | | |

---

## Section 4 — Risks to data subjects

For each risk, rate likelihood (Low/Medium/High) and severity (Low/Medium/High), then document the mitigation Corelyx provides and any additional mitigation you must add.

### 4.1 Confidentiality risk

> *Example: "An LLM provider (US-hosted) sees the email subject. Risk: cross-border transfer of personal data."*

| Field | Your answer |
|---|---|
| Risk description | |
| Likelihood | |
| Severity | |
| Corelyx mitigation | PII sanitization layer redacts emails, phones, IBANs, IPs, secrets before any prompt leaves the EU API tier. SCC-backed DPAs with Anthropic/OpenAI required. EU-hosted Mistral can be selected for stricter posture. |
| Additional mitigation you will add | |
| Residual risk | |

### 4.2 Integrity risk

> *Example: "Misclassification by the LLM routes an outage report to the wrong queue."*

| Field | Your answer |
|---|---|
| Risk description | |
| Likelihood | |
| Severity | |
| Corelyx mitigation | Approval gate available on every agent node (`requires_approval: true`) — execution pauses until a human approves. Run logs preserve full input + output for review. |
| Additional mitigation you will add | |
| Residual risk | |

### 4.3 Availability risk

| Field | Your answer |
|---|---|
| Risk description | |
| Likelihood | |
| Severity | |
| Corelyx mitigation | Retry with exponential backoff per agent/connector node. Inngest-enforced approval timeout fail-safe (no silent stalls). |
| Additional mitigation you will add | |
| Residual risk | |

### 4.4 Discrimination / fairness risk (AI Act high-risk only)

> *Example: "LLM classifies urgency partly based on writing style; non-native speakers may be deprioritized."*

| Field | Your answer |
|---|---|
| Risk description | |
| Likelihood | |
| Severity | |
| Mitigation | |
| Bias testing methodology + results | |
| Residual risk | |

### 4.5 Cross-border transfer risk (US LLM providers)

| Field | Your answer |
|---|---|
| Are any LLM calls or connector calls processed outside the EU? | |
| Which providers? | |
| Transfer mechanism (DPA + SCC, Adequacy Decision) | |
| Have you reviewed the provider's Transfer Impact Assessment (TIA)? | |
| Can you switch to an EU-hosted alternative for this workflow? | |

---

## Section 5 — AI Act–specific (only if the workflow uses agent nodes in a high-risk Annex III domain)

| Question | Your answer |
|---|---|
| Which Annex III domain applies? | |
| What is the role of the AI in the decision (advisory / automatic)? | |
| Is there a meaningful human review before the AI's output affects the data subject? | |
| Is the approval gate enabled on every AI step? | |
| What is the approval-decider's training and authority to override? | |
| What happens if the AI is unavailable or wrong? | |
| Have you registered as a deployer with the relevant authority (if required)? | |

---

## Section 6 — Data subject rights

Describe how each right is operationalized for this workflow:

| Right | How it is supported |
|---|---|
| Information (Art. 13/14) — privacy notice covering this processing | |
| Access (Art. 15) — DSR endpoint at `/api/user/dsar` returns all data |
| Rectification (Art. 16) — process for correcting inaccurate data | |
| Erasure (Art. 17) — account deletion at `/api/user/data-request` purges across stores |
| Restriction (Art. 18) — `processing_restricted` flag mechanism | |
| Portability (Art. 20) — `/api/user/export` returns machine-readable JSON |
| Object (Art. 21) — workflow can be paused/disabled instantly | |
| Not subject to automated decision-making (Art. 22) | |

---

## Section 7 — Sign-off

| Field | Name | Date |
|---|---|---|
| Completed by | | |
| Reviewed by DPO / privacy lead | | |
| Approved by controller representative | | |
| Date of next review (recommended: annual or on material change) | | |

---

## Appendix — Corelyx controls that apply by default

These mitigations are part of the platform; you do not need to implement them, but you should reference them in your DPIA:

| Control | Reference |
|---|---|
| EU-only production hosting | [SUBPROCESSORS.md](SUBPROCESSORS.md) |
| TLS 1.3 in transit, AES-256 at rest | [compliance_plan.md](compliance_plan.md) §3.7 |
| Tenant isolation enforced at app layer + Postgres RLS | [tenant-isolation.test.ts](apps/web/lib/__tests__/tenant-isolation.test.ts) |
| PII sanitization on every LLM prompt | [pii.ts](apps/web/lib/privacy/pii.ts), [pii.py](apps/runtime/engine/pii.py) |
| Configurable execution log verbosity (default METADATA_ONLY) | [db.py](apps/runtime/db.py) |
| Approval-gate fail-safe (timeout = rejection, not bypass) | [approval-timeout.ts](apps/web/lib/inngest/approval-timeout.ts), [executor.py](apps/runtime/engine/executor.py) |
| Immutable audit log of every approval decision | [approvals/[id]/route.ts](apps/web/app/api/approvals/[id]/route.ts) |
| AI-generated workflow review banner before activation | [AI Act Art. 50 transparency control] |
| OAuth tokens stored in Vault, never returned to frontend | [vault.ts](apps/web/lib/vault.ts), `getValidToken()` pattern |
| Subprocessor change notifications with 30-day notice | [SUBPROCESSORS.md](SUBPROCESSORS.md) |

---

## Appendix — When you must consult the supervisory authority

Per GDPR Art. 36, if your DPIA concludes that the processing involves **high residual risk** that you cannot mitigate, you must consult the supervisory authority **before** beginning the processing.

In Austria: Datenschutzbehörde (DSB) — https://www.dsb.gv.at
For other EU member states: identify your lead supervisory authority based on main establishment.

This template does not constitute legal advice. For high-risk processing, engage qualified privacy counsel.
