# Governance & Compliance Center — Manual QA Checklist

Audit date: 2026-07-02. This checklist proves each public governance claim is
reachable, visible, and functional in the product. Run it after any change to
`apps/web/app/(app)/governance/**`, the sidebar, or the approval pipeline.

## Current-state summary (audit result)

| Area | State before | State now |
| --- | --- | --- |
| Governance dashboard | Existed at `/governance`, buried under Settings sub-nav | Top-level "Governance & Compliance" nav section, one click from anywhere |
| Human approval gates | Existed (agent `requires_approval`, approvals inbox, run status) but no named approver or configurable reason | Approver (name/role) + plain-language reason configurable per gate, recorded on the approval and shown in the inbox |
| Audit logs + reports | Data existed (runs, node telemetry, policy checks, immutable `app_logs`) but no unified view or admin export | `/governance/audit-logs` view + CSV/PDF/JSON export at `/api/governance/audit-log/export` |
| Data controls | Existed in workspace settings modal only; DSAR handling in EU Compliance Center | `/governance/data-controls`: storage, retention, screening, region, DSAR entry points, per-workflow data profile |
| Access & credentials | Data existed, no admin view | `/governance/access`: members, per-workflow access, credential inventory, scope, warnings |
| EU AI Act checkpoints | Existed in per-workflow settings (3+ clicks) | `/governance/ai-act`: aggregated, inline-editable, feeds dashboard and exports |
| Exports | Scattered (dashboard buttons, per-program endpoints) | `/governance/exports` hub: inventory, audit log, evidence pack, per-workflow DPIA/technical docs, personal-data export |

## Navigation (2 clicks max)

- [ ] Sidebar shows a "Governance & Compliance" section with a Governance entry
      (shield icon) between Data and Settings. Visible in collapsed rail and
      expanded state; sub-items (Reviews, Audit Logs, Data Controls,
      Access & Credentials, AI Act Checkpoints, Exports) appear when expanded.
- [ ] Clicking Governance lands on the dashboard (1 click).
- [ ] Every sub-page is reachable from the tab bar on any governance page
      (2 clicks total from anywhere in the app).

## 1. Dashboard (`/governance`)

- [ ] Metrics row shows: AI systems, Pending approvals, High risk, Docs
      missing, Oversight gaps, Due review.
- [ ] "Pending approvals" and "Due review" cards link to `/governance/reviews`.
- [ ] Inventory table lists every workflow with risk classification, oversight
      status, documentation/DPIA status, and quick-fix actions.
- [ ] Compliance action plan lists remediation items citing GDPR / AI Act articles.

## 2. Approval gates

- [ ] In the workflow editor, an agent node's Prompt tab has "Requires human
      approval". Enabling it reveals timeout, "Approver (name or role)", and
      "Reason shown to the approver" fields.
- [ ] Agent nodes with a gate show an "Approval" badge on the canvas.
- [ ] A run hitting the gate pauses with status `waiting_approval` (visible in
      Runs and run history).
- [ ] `/approvals` shows the pending card with assigned approver, reason,
      input context, note field, and Approve / Reject buttons.
      (Dev: use the "Seed approval" button on `/approvals` for demo data.)
- [ ] Decision is timestamped and appears under `/governance/reviews`
      → "Recent decisions" and in audit-log exports.

## 3. Audit logs (`/governance/audit-logs`)

- [ ] Table shows workflow name + run id, result, actor, models, connector
      actions, policy checks (passed/flagged), approvals, and timestamp.
- [ ] "Download CSV" and "Download PDF" produce files without errors.
      CSV opens in a spreadsheet; formula-looking values are neutralized.
- [ ] Unit tests: `apps/web/lib/compliance/__tests__/audit-log.test.ts`.

## 4. Data controls (`/governance/data-controls`)

- [ ] Storage toggles (prompts/outputs) default OFF and describe minimisation.
- [ ] Retention fields (run history, prompts, outputs, approval records) are
      editable by owners/admins; viewers see a read-only notice.
- [ ] Saving persists (reload the page and confirm values).
- [ ] DSAR cards link to the EU Compliance Center and data-request tracking.
- [ ] Per-workflow table shows data sources, personal/sensitive data flags,
      DPIA status, and links to workflow settings.

## 5. Access & credentials (`/governance/access`)

- [ ] Members list shows every workspace member with a plain-language role.
- [ ] Per-workflow table shows owner, visibility, shared users, linked
      connected accounts, and credential scope.
- [ ] Credential inventory lists connections (per-workflow scope) and model
      API keys (workspace-wide scope) with status.
- [ ] Invalid credentials produce a warning banner; unused connections get a tip.

## 6. AI Act checkpoints (`/governance/ai-act`)

- [ ] Every workflow appears with risk, oversight, sensitive-data, and review
      pills.
- [ ] Expanding a row lets a non-technical user edit use case, risk level,
      oversight/transparency checkboxes, reviewer, and notes; "Save checkpoint"
      persists via `/api/programs/[id]/settings`.
- [ ] "Mark reviewed today" stamps the review date and clears "Review due".
- [ ] The same record is editable from the workflow's own Settings page.

## 7. Exports (`/governance/exports`)

- [ ] Inventory export works in JSON / CSV / XLSX / PDF.
- [ ] Run audit log downloads as CSV and PDF.
- [ ] Evidence pack ZIP contains README, inventory, approvals, per-agent
      audits, and a SHA-256 MANIFEST.
- [ ] Per-workflow technical docs + DPIA drafts download (PDF/Word) and are
      labeled as drafts, not finished legal documents.
- [ ] "Download my data (JSON)" returns the personal-data export.

## Honesty constraints

- Generated DPIA/technical documents are labeled drafts/working papers.
- The AI Act classifier output is labeled a governance aid, not legal advice.
- No page claims certification or guaranteed legal compliance.
