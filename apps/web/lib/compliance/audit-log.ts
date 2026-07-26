import type { LooseServiceClient } from "@/lib/api";
import type { ComplianceCheck } from "@/lib/compliance/workflow";
import { toCsv } from "@/lib/compliance/export";

const IN_CHUNK = 300;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type RunApprovalSummary = {
  approval_id: string;
  status: string | null;
  approver: string | null;
  decision_note: string | null;
  decided_at: string | null;
};

export type RunAuditRecord = {
  run_id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  actor: string;
  triggered_by: string;
  models_used: string[];
  providers_used: string[];
  connector_actions: string[];
  policy_checks_passed: number;
  policy_checks_flagged: number;
  policy_check_notes: string[];
  approvals: RunApprovalSummary[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  error_message: string | null;
};

export type RunAuditBundle = {
  workspace_id: string;
  generated_at: string;
  records: RunAuditRecord[];
};

function parsePolicyChecks(raw: unknown): ComplianceCheck[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ComplianceCheck =>
      !!item && typeof item === "object" && typeof (item as ComplianceCheck).status === "string"
  );
}

/**
 * Assemble the run-level audit log for a workspace: one record per run with the
 * workflow, actor, models/providers, connector tool calls, policy-check
 * outcomes, and every human approval decision attached to that run.
 *
 * Shared by the Governance → Audit Logs page and the CSV/PDF export route so
 * both always show the same evidence.
 */
export async function collectRunAuditLog(
  db: LooseServiceClient,
  workspaceId: string,
  limit = 100
): Promise<RunAuditBundle> {
  const generatedAt = new Date().toISOString();

  const { data: runRows, error } = await db
    .from("runs")
    .select(
      "id, program_id, status, triggered_by, started_at, completed_at, created_at, error_message, user_id, policy_checks, programs!inner(id, name, workspace_id)"
    )
    .eq("programs.workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load run audit log: ${error.message}`);

  const runs = (runRows ?? []) as Array<{
    id: string;
    program_id: string;
    status: string;
    triggered_by: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string | null;
    error_message: string | null;
    user_id: string | null;
    policy_checks: unknown;
    programs: { id: string; name: string };
  }>;

  if (runs.length === 0) return { workspace_id: workspaceId, generated_at: generatedAt, records: [] };

  const runIds = runs.map((r) => r.id);

  // Node executions carry per-step model/provider evidence and tool calls.
  type ExecRow = {
    id: string;
    run_id: string;
    node_id: string;
    provider_id: string | null;
    model_id: string | null;
    tool_calls: unknown;
  };
  const execRows: ExecRow[] = [];
  for (const group of chunk(runIds, IN_CHUNK)) {
    const { data } = await db
      .from("node_executions")
      .select("id, run_id, node_id, provider_id, model_id, tool_calls")
      .in("run_id", group);
    execRows.push(...(((data ?? []) as ExecRow[])));
  }

  const execIdToRun = new Map(execRows.map((e) => [e.id, e.run_id]));

  // Approvals attached to those executions.
  type ApprovalRow = {
    id: string;
    node_execution_id: string;
    user_id: string | null;
    status: string | null;
    context: { approver?: string } | null;
    decision_note: string | null;
    decided_at: string | null;
  };
  const approvalRows: ApprovalRow[] = [];
  for (const group of chunk([...execIdToRun.keys()], IN_CHUNK)) {
    const { data } = await db
      .from("approvals")
      .select("id, node_execution_id, user_id, status, context, decision_note, decided_at")
      .in("node_execution_id", group);
    approvalRows.push(...(((data ?? []) as ApprovalRow[])));
  }

  // Resolve actor display names.
  const userIds = [
    ...new Set(
      [...runs.map((r) => r.user_id), ...approvalRows.map((a) => a.user_id)].filter(
        (id): id is string => Boolean(id)
      )
    ),
  ];
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await db.from("profiles").select("id, display_name").in("id", userIds);
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (p.display_name) nameById.set(p.id, p.display_name);
    }
  }

  const execsByRun = new Map<string, ExecRow[]>();
  for (const e of execRows) {
    const list = execsByRun.get(e.run_id) ?? [];
    list.push(e);
    execsByRun.set(e.run_id, list);
  }

  const approvalsByRun = new Map<string, RunApprovalSummary[]>();
  for (const a of approvalRows) {
    const runId = execIdToRun.get(a.node_execution_id);
    if (!runId) continue;
    const list = approvalsByRun.get(runId) ?? [];
    list.push({
      approval_id: a.id,
      status: a.status,
      approver: a.context?.approver?.trim() || (a.user_id ? nameById.get(a.user_id) ?? a.user_id : null),
      decision_note: a.decision_note,
      decided_at: a.decided_at,
    });
    approvalsByRun.set(runId, list);
  }

  const records: RunAuditRecord[] = runs.map((run) => {
    const execs = execsByRun.get(run.id) ?? [];
    const models = [...new Set(execs.map((e) => e.model_id).filter((v): v is string => Boolean(v)))];
    const providers = [...new Set(execs.map((e) => e.provider_id).filter((v): v is string => Boolean(v)))];
    const connectorActions = [
      ...new Set(
        execs.flatMap((e) => {
          if (!Array.isArray(e.tool_calls)) return [] as string[];
          return (e.tool_calls as Array<Record<string, unknown>>)
            .map((call) => (typeof call?.tool === "string" ? call.tool : null))
            .filter((v): v is string => Boolean(v));
        })
      ),
    ];
    const checks = parsePolicyChecks(run.policy_checks);
    const passed = checks.filter((c) => c.status === "passed").length;
    const flagged = checks.length - passed;
    const notes = checks
      .filter((c) => c.status !== "passed")
      .map((c) => `${c.label}: ${c.status}`);

    return {
      run_id: run.id,
      workflow_id: run.program_id,
      workflow_name: run.programs?.name ?? "Unknown workflow",
      status: run.status,
      actor: (run.user_id && nameById.get(run.user_id)) || run.triggered_by || "system",
      triggered_by: run.triggered_by ?? "unknown",
      models_used: models,
      providers_used: providers,
      connector_actions: connectorActions,
      policy_checks_passed: passed,
      policy_checks_flagged: flagged,
      policy_check_notes: notes,
      approvals: approvalsByRun.get(run.id) ?? [],
      started_at: run.started_at,
      completed_at: run.completed_at,
      created_at: run.created_at,
      error_message: run.error_message,
    };
  });

  return { workspace_id: workspaceId, generated_at: generatedAt, records };
}

const CSV_HEADERS = [
  "run_id",
  "workflow_name",
  "workflow_id",
  "status",
  "actor",
  "triggered_by",
  "models_used",
  "providers_used",
  "connector_actions",
  "policy_checks_passed",
  "policy_checks_flagged",
  "policy_check_notes",
  "approvals",
  "started_at",
  "completed_at",
  "created_at",
  "error_message",
];

function approvalCell(approvals: RunApprovalSummary[]) {
  if (approvals.length === 0) return "";
  return approvals
    .map(
      (a) =>
        `${a.status ?? "pending"} by ${a.approver ?? "unassigned"}${a.decided_at ? ` at ${a.decided_at}` : ""}${a.decision_note ? ` (${a.decision_note})` : ""}`
    )
    .join(" | ");
}

export function auditLogToCsv(records: RunAuditRecord[]): string {
  return toCsv(
    CSV_HEADERS,
    records.map((r) => [
      r.run_id,
      r.workflow_name,
      r.workflow_id,
      r.status,
      r.actor,
      r.triggered_by,
      r.models_used,
      r.providers_used,
      r.connector_actions,
      r.policy_checks_passed,
      r.policy_checks_flagged,
      r.policy_check_notes,
      approvalCell(r.approvals),
      r.started_at,
      r.completed_at,
      r.created_at,
      r.error_message,
    ])
  );
}

/** Plain-text report body rendered into the PDF export. */
export function auditLogToReportText(bundle: RunAuditBundle): string {
  const lines: string[] = [
    `Workspace: ${bundle.workspace_id}`,
    `Generated at: ${bundle.generated_at}`,
    `Runs included: ${bundle.records.length} (most recent first)`,
    "",
    "This report lists workflow executions with the models and connectors used,",
    "policy-check outcomes, and every human approval decision for each run.",
    "",
  ];

  for (const r of bundle.records) {
    lines.push(`## Run ${r.run_id}`);
    lines.push(`Workflow: ${r.workflow_name}`);
    lines.push(`Status: ${r.status}`);
    lines.push(`Actor: ${r.actor} (trigger: ${r.triggered_by})`);
    lines.push(`Started: ${r.started_at ?? "-"}  Completed: ${r.completed_at ?? "-"}`);
    lines.push(`Models: ${r.models_used.length ? r.models_used.join(", ") : "none recorded"}`);
    lines.push(`Providers: ${r.providers_used.length ? r.providers_used.join(", ") : "none recorded"}`);
    lines.push(
      `Connector actions: ${r.connector_actions.length ? r.connector_actions.join(", ") : "none recorded"}`
    );
    lines.push(
      `Policy checks: ${r.policy_checks_passed} passed, ${r.policy_checks_flagged} flagged` +
        (r.policy_check_notes.length ? ` (${r.policy_check_notes.join("; ")})` : "")
    );
    if (r.approvals.length > 0) {
      lines.push("Approvals:");
      for (const a of r.approvals) {
        lines.push(
          `  - ${a.status ?? "pending"} by ${a.approver ?? "unassigned"}${a.decided_at ? ` at ${a.decided_at}` : ""}${a.decision_note ? ` — ${a.decision_note}` : ""}`
        );
      }
    } else {
      lines.push("Approvals: none required");
    }
    if (r.error_message) lines.push(`Error: ${r.error_message}`);
    lines.push("");
  }

  return lines.join("\n");
}
