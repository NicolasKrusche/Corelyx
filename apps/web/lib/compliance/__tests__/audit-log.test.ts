import { describe, it, expect } from "vitest";
import {
  auditLogToCsv,
  auditLogToReportText,
  type RunAuditBundle,
  type RunAuditRecord,
} from "@/lib/compliance/audit-log";

function makeRecord(overrides: Partial<RunAuditRecord> = {}): RunAuditRecord {
  return {
    run_id: "run-1111",
    workflow_id: "prog-2222",
    workflow_name: "Invoice triager",
    status: "completed",
    actor: "Ada Lovelace",
    triggered_by: "manual",
    models_used: ["claude-opus-4-8"],
    providers_used: ["anthropic"],
    connector_actions: ["gmail.send_email"],
    policy_checks_passed: 3,
    policy_checks_flagged: 1,
    policy_check_notes: ["EU-only providers: warning"],
    approvals: [
      {
        approval_id: "appr-1",
        status: "approved",
        approver: "Compliance Lead",
        decision_note: "Looks fine",
        decided_at: "2026-07-01T10:00:00Z",
      },
    ],
    started_at: "2026-07-01T09:59:00Z",
    completed_at: "2026-07-01T10:01:00Z",
    created_at: "2026-07-01T09:58:00Z",
    error_message: null,
    ...overrides,
  };
}

describe("auditLogToCsv", () => {
  it("includes workflow, run id, actor, models, connectors, policy checks, and approvals", () => {
    const csv = auditLogToCsv([makeRecord()]);
    const [header, row] = csv.split("\n");
    expect(header).toContain("run_id");
    expect(header).toContain("policy_checks_passed");
    expect(header).toContain("approvals");
    expect(row).toContain("Invoice triager");
    expect(row).toContain("run-1111");
    expect(row).toContain("claude-opus-4-8");
    expect(row).toContain("gmail.send_email");
    expect(row).toContain("approved by Compliance Lead at 2026-07-01T10:00:00Z");
  });

  it("neutralizes formula-injection payloads in workflow names", () => {
    const csv = auditLogToCsv([
      makeRecord({ workflow_name: "=HYPERLINK(\"http://evil\")" }),
    ]);
    const row = csv.split("\n")[1];
    expect(row).toContain("'=HYPERLINK");
  });

  it("handles runs without approvals or telemetry", () => {
    const csv = auditLogToCsv([
      makeRecord({
        approvals: [],
        models_used: [],
        providers_used: [],
        connector_actions: [],
        policy_checks_passed: 0,
        policy_checks_flagged: 0,
        policy_check_notes: [],
      }),
    ]);
    expect(csv.split("\n")).toHaveLength(2);
  });
});

describe("auditLogToReportText", () => {
  it("renders one section per run with approval evidence", () => {
    const bundle: RunAuditBundle = {
      workspace_id: "ws-3333",
      generated_at: "2026-07-02T12:00:00Z",
      records: [makeRecord(), makeRecord({ run_id: "run-9999", approvals: [] })],
    };
    const text = auditLogToReportText(bundle);
    expect(text).toContain("Run run-1111");
    expect(text).toContain("Run run-9999");
    expect(text).toContain("approved by Compliance Lead");
    expect(text).toContain("Approvals: none required");
    expect(text).toContain("Policy checks: 3 passed, 1 flagged");
  });
});
