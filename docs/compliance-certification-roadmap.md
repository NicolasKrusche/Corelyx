# Compliance & Certification Roadmap

> **Audience:** Solo founder, pre-revenue / early-stage  
> **Goal:** Display all eight compliance badges credibly and legally  
> **Honest constraint:** Four of these require a paid third-party auditor — that is non-negotiable by definition. The other four are completely free.

---

## The hard truth about ISO certifications

ISO 27001, ISO 27017, ISO 20000-1, and ISO 14001 are **third-party audited standards**.
You cannot self-certify. An accredited certification body (CB) must audit your implementation
and issue the certificate. Displaying the badge without a certificate is **false advertising**
and a legal liability in B2B/enterprise contracts.

The minimum unavoidable cost is the CB audit fee. Everything _before_ the audit — all the
documentation, policy writing, control implementation — can be done entirely for free by
yourself.

---

## Cost reality: what is truly free vs what costs money

| Certification | Truly free? | Minimum paid cost | Notes |
|---|---|---|---|
| **CSA STAR Level 1** | ✅ 100 % free | €0 | Self-assessment uploaded to public registry |
| **NIS2 Conformance** | ✅ 100 % free | €0 | Self-declaration; no auditor at your stage |
| **Green Web Foundation** | ✅ Free if Vercel qualifies | €0 | Vercel EU likely already qualifies |
| **CISPE Cloud Code** | ✅ Free self-declaration | €0 | Official listing has a fee; self-decl does not |
| **ISO 27001:2022** | ❌ Audit required | ~€1 500–3 000 one-time | Can slash cost with a startup-friendly CB |
| **ISO 27017:2015** | ❌ Bundled with 27001 | +€300–500 on top of 27001 | Not a standalone cert; same audit scope |
| **ISO 20000-1:2018** | ❌ Audit required | ~€2 000–4 000 | Defer until enterprise customers demand it |
| **ISO 14001:2015** | ❌ Audit required | ~€1 000–2 000 | Bundle with 27001 to reduce cost |

**Realistic minimum to display all badges legitimately:**
- Free tier (4 badges): €0, ~2–4 weeks of documentation work
- ISO tier (4 badges): ~€3 000–6 000 total if you bundle all audits and do all prep yourself

**Ways to cut ISO costs further:**
- Do 100 % of prep yourself (no consultants) — saves €2 000–5 000
- Bundle 27001 + 27017 + 14001 into one integrated audit — one CB, one visit
- Use a startup-focused CB (e.g. Certification Europe, A-LIGN, Schellman) instead of TÜV/BSI
- Do ISO 20000-1 at the 3-year re-certification of 27001, not as a separate audit

---

## What you CAN do for free right now (Weeks 1–8)

These four badges can be earned immediately — no auditor, no fees.

---

### FREE 1 — Green Web Foundation

**Effort:** 1–2 hours  
**Cost:** €0

1. Go to [thegreenwebfoundation.org/green-web-check](https://www.thegreenwebfoundation.org/green-web-check/) and check `corelyx.app`.
2. Vercel (AWS eu-central-1 Frankfurt) is covered by AWS's renewable energy commitment — it **very likely already passes**.
3. If it passes: submit your domain for listing at [admin.thegreenwebfoundation.org](https://admin.thegreenwebfoundation.org). Upload the Vercel/AWS sustainability documentation as evidence.
4. Badge + API access granted. Done.

If it doesn't pass automatically, contact Vercel support and ask for their green energy attestation letter — that is sufficient evidence for GWF.

---

### FREE 2 — CSA STAR Level 1

**Effort:** 8–16 hours (spread over 2 days)  
**Cost:** €0

1. Register free at [cloudsecurityalliance.org](https://cloudsecurityalliance.org).
2. Download the **CAIQ v4.0.3** spreadsheet (Consensus Assessments Initiative Questionnaire).
3. Answer each of ~250 yes/no/NA questions. The questions cover: identity management, data security, encryption, logging, incident response, supply chain, etc.
4. For a solo SaaS with GitHub + Vercel + Supabase, most answers are documented by pointing at:
   - GitHub: MFA enforced, branch protection, Dependabot, CodeQL
   - Vercel: TLS everywhere, EU region, access logs
   - Supabase: encryption at rest, RLS, EU hosting, audit logs
   - Your existing `INCIDENT_RESPONSE.md`
5. Upload the completed CAIQ to the CSA STAR Registry.
6. Your entry appears publicly at [cloudsecurityalliance.org/star/registry](https://cloudsecurityalliance.org/star/registry).

**Re-submit once a year** to keep the listing current.

---

### FREE 3 — NIS2 Conformance

**Effort:** 4–8 hours to write the self-declaration  
**Cost:** €0

NIS2 is an EU Directive, not a certification body. There is no NIS2 badge issuer — conformance is a **self-declaration**. At your current company size (below 50 employees and €10M revenue) you are not yet a legally mandated entity, so this is entirely voluntary.

**What to produce:**

1. Write `docs/nis2-conformance-statement.md` mapping each Article 21 requirement to your existing controls:

| Article 21 Measure | Your evidence |
|---|---|
| Risk management policies | `docs/risk-register.md` (to be written) |
| Incident handling | `INCIDENT_RESPONSE.md` — add 72h customer notification clause |
| Business continuity / backups | Supabase daily backups, document RTO/RPO |
| Supply chain security | Supplier list in asset register; review annually |
| Secure development | GitHub branch protection, CodeQL SAST, PR review |
| Access control + MFA | MFA on GitHub/Vercel/Supabase — screenshot and date-stamp |
| Cryptography | TLS 1.2+ on all endpoints; encryption at rest via Supabase/Vercel |

2. Add a sentence to your `/security` page: _"Corelyx is voluntarily aligned with NIS2 Article 21 security measures."_ Link to your public conformance statement if desired.

No registration required until you cross the legal thresholds.

---

### FREE 4 — CISPE Cloud Code (Self-Declaration)

**Effort:** 4–6 hours  
**Cost:** €0 for self-declaration (official listing ~€400–700/yr — defer)

CISPE has two tiers:
- **Self-declaration:** Write a conformance statement and publish it. Free. No approval needed.
- **Official listing on cispe.cloud:** Requires submitting to CISPE + paying an admin fee. Defer until a customer specifically asks for it.

**Self-declaration checklist:**

| Requirement | Status |
|---|---|
| EU-first storage and processing controls | Document: Vercel/Supabase/Railway regions, EU-only mode for eligible workflows, and known limits for customer-selected providers |
| No use of customer data for advertising or own profiling | Already stated in Privacy Policy + DPA |
| Transparent sub-processor list | `/subprocessors` page — ✅ live |
| DPA available to every customer | `/dpa` page — ✅ live |
| Data portability on request | `/data-export-schema` — ✅ live |
| Deletion on request | Settings → delete account flow |
| Security measures in place | Document: TLS, MFA, access control, logging |

Produce `docs/cispe-self-assessment.md` ticking each item with a link to evidence.
Add _"CISPE Code of Conduct aligned"_ to your `/security` page.

---

## What requires a paid auditor (ISO certs)

Everything below this line requires an accredited CB. All preparation is free — only the
final audit costs money. Do all of this yourself before booking an auditor.

---

### ISO PREP — Foundation documents (Weeks 1–6, €0)

These documents are required for all four ISO certifications. Write them once.

**Asset & Scope Register** (`docs/asset-register.md`)
- Every service: Vercel, Railway, Supabase, GitHub, Resend, Stripe
- Owner, data classification (public / internal / confidential / restricted), cloud region
- Extend the existing `AI_SYSTEM_INVENTORY.md`

**Risk Register** (`docs/risk-register.md`)
- Per asset: top threats, likelihood (1–5), impact (1–5), existing control, residual risk
- ~15–20 rows is sufficient for a small SaaS

**Statement of Applicability** (`docs/soa.md`)
- List all 93 ISO 27001 Annex A controls
- Mark each: Applicable / Excluded (with justification)
- For applicable controls: note the evidence or implementation

**Policy suite** (`docs/policies/`)
- `information-security-policy.md` — 1 page, signed, dated
- `access-control-policy.md`
- `acceptable-use-policy.md`
- `incident-response-policy.md` — upgrade existing `INCIDENT_RESPONSE.md`
- `change-management-policy.md`
- `business-continuity-policy.md`
- `supplier-security-policy.md`
- `environmental-policy.md` (for ISO 14001)

**Management review** (`docs/management-review-YYYY.md`)
- 1-page annual review: ISMS objectives, risks, incidents, audit findings, next steps
- You are both management and author — sign and date it

---

### ISO 27001:2022 + ISO 27017:2015 (single bundled audit)

**Audit cost:** ~€1 800–3 500 total (both standards together)  
**Prep cost:** €0 if you do it yourself  
**When to book:** After all foundation docs are complete and self-audit passes

ISO 27017 is not a standalone certification. You add it to your ISO 27001 scope.
The CB audits both at the same time. One certificate lists both standards.

**27017-specific additions to your SoA:**

| Control | What to write |
|---|---|
| CLD.6.3.1 | Shared responsibility matrix per provider (Vercel/Supabase/Railway each have a trust doc) |
| CLD.8.1.1 | Cloud service inventory (already in asset register) |
| CLD.9.5.1 | Who has cloud console admin access and under what conditions |
| CLD.9.5.2 | Tenant isolation: document Supabase RLS + Vercel project isolation |

**Choosing a CB:**
- [Certification Europe](https://www.certificationeurope.com) — startup-friendly, competitive pricing
- [A-LIGN](https://a-lign.com) — strong for SaaS, remote-first audits
- [Auditee.io](https://auditee.io) — tech-startup focused, newer CB, lower cost
- Get 2–3 quotes; mention you want a remote audit and that you're a 1-person company — many CBs have startup tiers

---

### ISO 14001:2015 (bundle with 27001 audit)

**Additional audit cost:** ~€500–1 200 when bundled with ISO 27001  
**Prep cost:** €0  
**When to book:** Same time as ISO 27001

For a cloud-only SaaS, the environmental scope is narrow and straightforward.

**Environmental aspects to document** (`docs/environmental-aspects-register.md`):

| Aspect | Measure | Target |
|---|---|---|
| Cloud energy use | Estimated kWh/month via Vercel/Supabase dashboards | 100 % renewable hosting (already true via Vercel EU) |
| Developer hardware | Device lifecycle, disposal via certified e-waste | Responsible disposal documented |
| Paper / office | Remote-only, zero paper | Self-declare |
| Employee travel | Remote-first, no commute | Self-declare |

**Environmental Policy** (`docs/policies/environmental-policy.md`):
- Commitment to minimising environmental footprint
- Use of green hosting
- Annual review of environmental aspects
- Signed and dated

This is genuinely ~4 hours of work total.

---

### ISO 20000-1:2018 (defer — implement processes now, certify later)

**Audit cost:** ~€2 000–4 000 standalone; ~€1 000–2 000 bundled at 27001 re-cert  
**When:** Only when an enterprise customer contract explicitly requires it

ISO 20000-1 audits your _service management_ processes — not your security posture.
The processes you need to have running (not just documented) before an audit:

| Process | Minimum viable implementation |
|---|---|
| Change management | Every production deploy = a GitHub PR. Add a 5-line deploy checklist to PR description template. |
| Incident management | P1/P2/P3 classification in `INCIDENT_RESPONSE.md`. Post-mortem template for P1s. |
| Problem management | A simple log (could be a GitHub Issue label `problem`) for repeat incidents. |
| Release management | Git tags on every release. CHANGELOG.md. Rollback step documented. |
| SLA management | Status page (Better Uptime free tier). Define: 99.5 % uptime target, <4h P1 response. |
| Capacity planning | Monthly 5-minute review of Vercel/Supabase usage vs plan limits. |
| Supplier management | Annual review of all sub-processors against your supplier policy. |

**Implement these now** — they make you a better operator regardless of certification.
Book the audit only when a customer asks for the certificate.

---

## Phased rollout summary

### Now — free badges (Weeks 1–4)

```
Week 1:  Green Web Foundation check + submission           → badge live in days
Week 1:  Start CISPE self-assessment doc                   → publish within 1 week
Week 2:  Complete CSA CAIQ v4 questionnaire                → upload to registry
Week 3:  Write NIS2 conformance statement                  → publish on /security
Week 4:  Update /security page to show all four badges
```

**Cost: €0**

### Soon — ISO foundation (Weeks 2–8, still €0)

```
Week 2:  Extend AI_SYSTEM_INVENTORY.md → asset register
Week 3:  Write risk register
Week 4:  Write Statement of Applicability (SoA)
Week 5:  Write policy suite (7 policies)
Week 6:  Write management review
Week 7:  Self-audit against SoA — close gaps
Week 8:  Write environmental aspects register + env policy
```

**Cost: €0 — all prep work**

### When ready — book the audit (Weeks 10–16)

```
Week 9:  Get 3 quotes from CBs for ISO 27001 + 27017 + 14001 bundled
Week 10: Book Stage 1 (document review, remote, ~2h)
Week 12: Close Stage 1 findings
Week 14: Stage 2 audit (implementation review, remote, ~1 day)
Week 16: Certificate issued
```

**Cost: ~€2 500–4 500 one-time (all three ISO standards)**

### Later — ISO 20000-1 (at 3-year re-cert or first enterprise contract)

```
Implement processes now (free)
Add to re-certification scope of 27001 audit in Year 3
```

**Additional cost: ~€500–1 000 bundled**

---

## Total cost summary

| Track | Cost | When |
|---|---|---|
| CSA STAR + NIS2 + GWF + CISPE | **€0** | Now |
| ISO 27001 + 27017 + 14001 (bundled audit, DIY prep) | **~€2 500–4 500** | When ready |
| ISO 20000-1 (bundled at re-cert) | **~€500–1 000** | Year 3 |
| Annual surveillance (all ISO) | **~€800–1 500/yr** | Ongoing |

**Year 1 total: ~€2 500–4 500**  
**Year 2+: ~€800–1 500/yr**

There is no cheaper path to legitimate ISO certificates. The audit fee is the floor.
Everything else — prep, documentation, policy writing — is free if you do it yourself.

---

## Document deliverables checklist

```
docs/
├── policies/
│   ├── information-security-policy.md
│   ├── access-control-policy.md
│   ├── acceptable-use-policy.md
│   ├── incident-response-policy.md       ← upgrade INCIDENT_RESPONSE.md
│   ├── change-management-policy.md
│   ├── business-continuity-policy.md
│   ├── supplier-security-policy.md
│   └── environmental-policy.md
├── asset-register.md                     ← extend AI_SYSTEM_INVENTORY.md
├── risk-register.md
├── soa.md                                ← Statement of Applicability
├── management-review-YYYY.md
├── environmental-aspects-register.md
├── cispe-self-assessment.md
├── nis2-conformance-statement.md
├── green-web-foundation-evidence.md
├── csa-star-level-1-self-assessment.md
├── cloud-service-inventory.md            ← ISO 27017
├── shared-responsibility-matrix.md       ← ISO 27017
├── service-management-processes.md       ← ISO 20000-1 prep
├── postmortem-template.md
├── problem-management-log.md
├── capacity-review-YYYY-MM.md
└── compliance-certification-roadmap.md   ← this file
```

---

## Free resources

| Resource | Use |
|---|---|
| [ISO 27001 Annex A free checklist — IT Governance](https://www.itgovernance.eu/iso27001) | Build your SoA |
| [CSA CAIQ v4 download](https://cloudsecurityalliance.org/artifacts/caiq/) | STAR Level 1 questionnaire |
| [ENISA NIS2 self-assessment tool](https://www.enisa.europa.eu/topics/cybersecurity-policy/nis-directive-new) | NIS2 gap analysis |
| [CISPE Code of Conduct PDF](https://cispe.cloud/code-of-conduct/) | CISPE self-assessment base |
| [Green Web Foundation check](https://www.thegreenwebfoundation.org/green-web-check/) | Verify Vercel EU qualifies |
| [Auditee.io](https://auditee.io) | Startup-friendly ISO CB — get a quote |
