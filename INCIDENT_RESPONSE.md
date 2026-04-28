# Corelyx — Incident Response Plan

**Status:** Internal operations document
**Last updated:** 2026-04-28
**Owner:** Founding team / on-call engineer
**Related:** [compliance_plan.md](compliance_plan.md) §13, [SECURITY.md](SECURITY.md)
**Review cadence:** quarterly, plus after every incident regardless of severity

This is the operational runbook. It tells whoever is on call exactly what to do, in what order, and within what timeline.

---

## 0. Definitions

| Term | Definition |
|---|---|
| **Security incident** | Any event that compromises or threatens the confidentiality, integrity, or availability of Corelyx systems, customer data, or the AI pipeline. |
| **Personal data breach** | A security incident resulting in accidental or unlawful destruction, loss, alteration, or unauthorized disclosure of, or access to, personal data. |
| **Notifiable breach** | A personal data breach "likely to result in a risk to the rights and freedoms of natural persons" (GDPR Art. 33). Triggers DPA notification within 72h. |
| **High-risk breach** | A breach "likely to result in a HIGH risk" (GDPR Art. 34). Requires notifying affected individuals as well. |
| **Significant incident** | Per NIS2 Art. 23: an incident causing severe operational disruption or financial loss, or able to affect other parties. Triggers CSIRT early-warning within 24h. |
| **DPO** | Data Protection Officer (designated). |
| **IC** | Incident commander — the person leading the response. By default the on-call engineer; transferred to DPO/founder for any notifiable breach. |

---

## 1. Roles

| Role | Responsibility | Default holder |
|---|---|---|
| Incident commander (IC) | Drives the response. Single point of decision. | On-call engineer |
| Communications lead | Drafts customer / authority notifications. | Founder |
| DPO / privacy lead | Determines GDPR notifiability, drafts DPA notification. | TBA — assign before launch |
| Technical lead | Investigates root cause, applies fix. | On-call engineer |
| Customer support | Answers customer questions during and after. | Support rotation |
| Scribe | Maintains the incident timeline document. | IC delegates if needed |

One person can hold multiple roles in a small team. The IC is always exactly one person.

---

## 2. Severity classification

Use this table to set severity in the first 30 minutes. It drives the timeline below.

| Severity | Examples | Initial response |
|---|---|---|
| **SEV-1** | Production outage; cross-tenant data leak confirmed; ransomware; secret material exposed publicly; AI pipeline auto-acting on wrong tenant's data | Page everyone. Convene war room within 30 minutes. Pause all non-critical writes. |
| **SEV-2** | Single-tenant data exposure; partial outage; auth bypass reproducible but not yet exploited; LLM provider outage with no fallback | Page IC + technical lead. War room within 1 hour. |
| **SEV-3** | Suspicious access pattern; failed but blocked attack; non-blocking degradation | Acknowledge in #incidents within 1 hour. No paging required. |
| **SEV-4** | Logged anomaly worth tracking; near-miss; reproducible bug with no exposure | File in the breach register; review at the next weekly. |

If unsure, escalate up. Downgrading later is fine; missing a SEV-1 is not.

---

## 3. Response timeline

The clock starts at **detection time** — when any human or alert first becomes aware of the issue.

```
T+0          DETECTION
              │
              ▼
T+15min      ACKNOWLEDGE
              → IC named (post in #incidents: "I am IC for $TICKET")
              → Severity set
              → Open the incident timeline doc (one shared doc per incident)
              │
              ▼
T+1h         CONTAINMENT
              → Isolate affected systems (revoke tokens, disable triggers, freeze writes)
              → Preserve evidence — DO NOT delete logs, terminate workers,
                or rotate keys until forensics has snapshots
              → Notify internal team beyond the war room if SEV-1/SEV-2
              │
              ▼
T+4h         INITIAL ASSESSMENT
              → Was personal data involved?  (See §4)
              → Scope: how many users, which data categories, how long
              → Notifiable breach? High-risk breach?
              → Notify DPO and founder (always, for SEV-1/SEV-2)
              │
              ▼ (if NIS2 significant incident)
T+24h        NIS2 EARLY WARNING
              → Notify Austrian CSIRT (CERT.at) — preliminary, may be incomplete
              → https://www.cert.at — see §6 for the report template
              │
              ▼ (if personal data breach)
T+72h        GDPR BREACH NOTIFICATION
              → Notify Datenschutzbehörde (DSB) — https://www.dsb.gv.at
              → Use the GDPR Art. 33 notification template (§7)
              → Even if data is incomplete, file what is known and supplement later
              │
              ▼ (if high-risk breach)
ASAP         NOTIFY AFFECTED INDIVIDUALS
              → Plain-language email; no jargon
              → What happened; what data was affected; what we are doing;
                what they should do; who to contact
              │
              ▼
T+30 days    NIS2 FINAL REPORT
              → Detailed root-cause analysis to authorities
              → Remediation measures implemented
              │
              ▼
T+45 days    INTERNAL POST-MORTEM
              → Blameless write-up published internally
              → Action items tracked to completion
              → DPIA / security policy / runbook updated as needed
```

---

## 4. The "is personal data involved" decision

If you cannot answer "no" with high confidence, treat the answer as "yes" and proceed with notification preparation.

Personal data in Corelyx flows through:

1. **User accounts** — names, emails, hashed passwords, MFA factors, billing email
2. **Workflow execution logs** — by default `METADATA_ONLY`, so payloads are NOT logged at full fidelity, but emails / phones / contact data may appear in node descriptions, agent system prompts, and connector parameters
3. **Connector credentials** — encrypted in Vault; the credential rows themselves identify the user
4. **Customer data fetched at runtime** — Gmail messages, HubSpot contacts, Notion pages, etc., transit Corelyx during execution
5. **App logs** — include `user_id`, IP if logged, request paths, error context (sanitized via `pii.ts` for LLM-related events)

Decision tree:

```
Did the incident expose, alter, or destroy data from any of these sources?
  │
  ├─ NO  → Not a personal-data breach. Document, fix, monitor. End at §8 (post-mortem).
  │
  └─ YES → Personal-data breach.
            │
            ├─ Could the exposure cause physical, material, or non-material harm
            │  to data subjects (identity theft, fraud, financial loss, reputational
            │  damage, discrimination, loss of confidentiality)?
            │   │
            │   ├─ NO  → Notifiable to DPA only (T+72h). Document, contain, notify DSB.
            │   │
            │   └─ YES → HIGH-RISK breach. Notify DPA AND affected individuals.
            │            Special-category data is automatically high-risk.
```

---

## 5. Containment playbook by incident type

### 5.1 Cross-tenant data leak

1. **Stop the leak**: roll back the offending deploy, or feature-flag the route off.
2. **Quantify**: query app_logs for every request that hit the affected route since the bug landed. Identify which tenants' data was visible to which other tenants.
3. **Preserve evidence** before any cleanup writes.
4. Run the [tenant-isolation.test.ts](apps/web/lib/__tests__/tenant-isolation.test.ts) probe to confirm the regression and prevent recurrence.
5. Notify all affected tenants (this is almost always high-risk).

### 5.2 Secret / credential exposure

1. **Rotate immediately**: every credential of the same class — internal-service tokens, OAuth tokens of the affected user(s), API keys, Supabase service role, webhook secrets.
2. **Revoke at the provider side too**, not just in our DB.
3. Audit the access logs of the leaked credential's scope for any unauthorized use.
4. If a customer's OAuth token leaked: revoke the connection, force them to re-link, notify them.

### 5.3 LLM / AI pipeline incident

If the AI pipeline produced or auto-acted on incorrect data:

1. **Pause executions** of the affected program(s) — disable triggers.
2. Identify the radius: which runs, which downstream side effects (Slack messages sent, Notion pages created, emails sent).
3. **Reverse side effects where possible** — delete sent messages, archive incorrect Notion pages, send corrections.
4. Re-run with approval gates forced on.
5. Update the AI System Inventory if the model behavior is now known to be unreliable for this use case.

### 5.4 Ransomware / malware on infrastructure

1. **Isolate the host** — disconnect networking before terminating.
2. Capture memory and disk snapshot before anything else.
3. Restore from last known-good backup. RTO target: 4 hours.
4. This is always SEV-1 and almost always notifiable.

### 5.5 DDoS or availability incident

1. Engage upstream protection (Vercel / Cloudflare WAF rules).
2. Document blast radius and duration for the NIS2 significant-incident threshold.
3. Note: DDoS that does NOT expose data is still a NIS2 significant incident if it materially affects service.

---

## 6. NIS2 early-warning template (T+24h)

Send to CERT.at (the Austrian national CSIRT) via their incident-reporting channel. This may be incomplete; supplement later.

```
Subject: NIS2 early warning — Corelyx — incident <ID>

Reporting entity:    Corelyx <legal entity name>
Contact:             <IC name>, <email>, <phone>
Incident ID:         <internal>
Detected:            <UTC timestamp>
Suspected cause:     <one sentence; "under investigation" is acceptable>
Affected services:   <list>
Affected geography:  <countries / EU>
Cross-border impact: <yes/no — if yes, list affected member states>
Initial estimate of severity: <SEV-1/2 + scale>
Containment status:  <ongoing / contained / fully restored>
Next update:         <within 24h>
```

---

## 7. GDPR Art. 33 notification template (T+72h)

Submit to the Datenschutzbehörde via https://www.dsb.gv.at. Include even partial information rather than waiting; you can supplement.

```
1. Nature of the breach
   - What happened, in plain language.
   - When it occurred (or when first detected if unknown).
   - How it was detected.

2. Categories and approximate number of data subjects concerned

3. Categories and approximate number of personal-data records concerned

4. Likely consequences for data subjects

5. Measures taken or proposed
   - Containment measures already in place.
   - Mitigation to reduce harm to data subjects.
   - Technical and organizational measures to prevent recurrence.

6. Contact point
   - DPO name, email, phone.
   - Will provide updates within X days as investigation progresses.
```

---

## 8. Notification to affected individuals (high-risk breaches)

Plain-language email. No legalese. Include:

- What happened — one sentence.
- When it happened.
- What data of theirs was affected.
- What we have done already.
- What they should do (rotate passwords, watch for phishing, monitor accounts).
- Direct contact: a real human at Corelyx, not a no-reply address.

Send via a channel they trust — typically the email on file. If the email itself is what was leaked, additionally surface a notice in the in-app dashboard.

---

## 9. Breach register

Maintain in [an internal source — e.g. a private GitHub repo or Linear project]. Record **every** incident, including SEV-3/4 and non-reportable ones. Schema:

| Field | Notes |
|---|---|
| Incident ID | Sequential or date-based |
| Severity | SEV-1..4 |
| Detected at | UTC |
| Detected by | Person / system |
| Description | Plain language |
| Personal-data categories affected | If any |
| Number of subjects | Approximate |
| Notifiable? | Yes / no + reasoning |
| Notifications sent | DPA, individuals, CSIRT — dates |
| Root cause | After post-mortem |
| Remediation | After post-mortem |
| Lessons learned | After post-mortem |
| Post-mortem doc | Link |

The breach register is itself personal data (it identifies internal staff and may name affected users). Apply the same retention and access controls as any other internal HR / sensitive document.

---

## 10. Authorities and contacts

| Authority | Role | Contact |
|---|---|---|
| Datenschutzbehörde (DSB) | Austrian DPA — GDPR Art. 33 notifications | https://www.dsb.gv.at — online breach-notification form |
| CERT.at | Austrian national CSIRT — NIS2 incident reporting | https://www.cert.at — `team@cert.at` |
| European AI Office | AI Act enforcement (GPAI models) | https://digital-strategy.ec.europa.eu/en/policies/ai-office |
| Anthropic security | LLM provider incidents | `security@anthropic.com` |
| OpenAI security | LLM provider incidents | `security@openai.com` |
| Supabase support | Database / Vault incidents | https://supabase.com/dashboard/support |
| Stripe support | Payment / billing incidents | https://support.stripe.com |
| Internal: founder | Final escalation | <update with phone> |

---

## 11. Post-mortem template

For every SEV-1 and SEV-2, and at the IC's discretion for SEV-3:

```
# Incident <ID> — <one-line title>

Date: <YYYY-MM-DD>
Severity: SEV-<N>
Duration: <T+0 to T+resolved>
Author: <IC>

## Summary
<Two paragraphs: what happened, what users experienced.>

## Timeline
<UTC timestamps. Detection → containment → mitigation → resolution.>

## Root cause
<The actual technical and process root causes. Plural is normal — most incidents have several.>

## Resolution
<What we did to make it stop.>

## What went well

## What did not go well

## Action items
| Item | Owner | Due |
|---|---|---|
| ... | ... | ... |

## Lessons for the runbook
<Updates to this document, the security policy, the AI System Inventory, or DPIAs.>
```

Post-mortems are blameless. We document systems and decisions, not individuals.

---

## 12. Drills

The runbook is exercised at least:

- **Tabletop exercise** every 6 months — IC walks the team through a hypothetical SEV-1 in real time.
- **Backup-restore drill** annually — actually restore from backup to a clean environment, time it, document the outcome. NIS2 §5.2 explicitly requires this.
- **Notification dry-run** annually — draft a fake DPA notification and a fake user notification end-to-end, get them reviewed by the DPO/legal.

Drill results are recorded in the breach register with severity = "drill".
