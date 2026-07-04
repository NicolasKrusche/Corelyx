import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ClipboardCheck, History, UserCheck, XCircle } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { loadGovernanceInventory } from "@/lib/compliance/governance-server";
import { MarkReviewedButton } from "../_components/mark-reviewed-button";
import { EmptyState, PanelSection, Pill, statusClass } from "../_components/ui";

export const metadata = {
  title: "Reviews — Governance & Compliance",
};

type ApprovalRow = {
  id: string;
  user_id: string;
  status: string;
  context: {
    node_label?: string;
    program_id?: string;
    reason?: string;
    approver?: string;
    requested_action?: string;
  } | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  node_executions: {
    node_id: string;
    run_id: string;
    runs: {
      program_id: string;
      programs: { id: string; name: string; workspace_id: string };
    };
  };
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function GovernanceReviewsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");

  const db = createServiceClient() as ReturnType<typeof createServiceClient> & {
    from(table: string): any;
  };

  const [inventory, { data: approvalsRaw }] = await Promise.all([
    loadGovernanceInventory(activeWorkspace.workspaceId, db as never),
    db
      .from("approvals")
      .select(
        `id, user_id, status, context, decision_note, decided_at, created_at,
         node_executions!inner (
           node_id, run_id,
           runs!inner ( program_id, programs!inner ( id, name, workspace_id ) )
         )`
      )
      .eq("node_executions.runs.programs.workspace_id", activeWorkspace.workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const approvals = (approvalsRaw ?? []) as ApprovalRow[];
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending").slice(0, 30);
  const dueForReview = inventory.records.filter((r) => r.review_due);

  // Resolve approver display names for the records we show.
  const userIds = [...new Set(approvals.map((a) => a.user_id).filter(Boolean))];
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (p.display_name) nameById.set(p.id, p.display_name);
    }
  }

  function approverLabel(a: ApprovalRow) {
    return a.context?.approver?.trim() || nameById.get(a.user_id) || "Workflow owner";
  }

  return (
    <div className="space-y-6 pb-12">
      <section className="border-b border-border pb-6">
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Reviews</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          Everything waiting on a human decision: runs paused at an approval gate, plus
          workflows whose governance record is due for a periodic check.
        </p>
      </section>

      {/* ── Pending approvals ─────────────────────────────────────────────── */}
      <PanelSection
        title="Waiting for approval"
        description="These runs are paused until someone approves or rejects the step. Decisions are recorded with a timestamp."
        actions={
          <Link
            href="/approvals"
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Open approval inbox
          </Link>
        }
      >
        {pending.length === 0 ? (
          <EmptyState>Nothing is waiting for approval right now.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Step</th>
                  <th className="px-3 py-2 font-semibold">Workflow</th>
                  <th className="px-3 py-2 font-semibold">Why it needs approval</th>
                  <th className="px-3 py-2 font-semibold">Approver</th>
                  <th className="px-3 py-2 font-semibold">Requested</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-sm">
                {pending.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="px-3 py-3 font-medium">
                      {a.context?.node_label ?? a.node_executions?.node_id ?? "Step"}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/programs/${a.node_executions?.runs?.program_id}`}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {a.node_executions?.runs?.programs?.name ?? "Unknown workflow"}
                      </Link>
                    </td>
                    <td className="max-w-[280px] px-3 py-3 text-xs text-muted-foreground">
                      {a.context?.reason ?? "Approval gate configured on this step."}
                    </td>
                    <td className="px-3 py-3 text-xs">{approverLabel(a)}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(a.created_at)}</td>
                    <td className="px-3 py-3">
                      <Link
                        href="/approvals"
                        className="inline-flex rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold transition-colors hover:bg-accent"
                      >
                        Decide
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelSection>

      {/* ── Workflows due for review ──────────────────────────────────────── */}
      <PanelSection
        title="Workflows due for a governance review"
        description="Never reviewed, or last reviewed more than 180 days ago. Confirm the record is still accurate, then mark it reviewed."
      >
        {dueForReview.length === 0 ? (
          <EmptyState>
            All workflows have been reviewed in the last 180 days.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {dueForReview.map((record) => (
              <div
                key={record.system_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{record.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Last reviewed: {record.last_review_date ? formatDate(record.last_review_date) : "Never"}
                    {" · "}
                    <span>Risk: {record.risk_classification}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {record.program_id && (
                    <Link
                      href={`/governance/ai-act?highlight=${record.program_id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold transition-colors hover:bg-accent"
                    >
                      <ClipboardCheck className="h-3 w-3" />
                      Edit checkpoint
                    </Link>
                  )}
                  {record.program_id && <MarkReviewedButton programId={record.program_id} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelSection>

      {/* ── Recent decisions ──────────────────────────────────────────────── */}
      <PanelSection
        title="Recent decisions"
        description="A timestamped record of every approve/reject decision. The full history is included in audit-log exports and the evidence pack."
        actions={
          <Link
            href="/governance/audit-logs"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent"
          >
            <History className="h-3.5 w-3.5" />
            View audit logs
          </Link>
        }
      >
        {decided.length === 0 ? (
          <EmptyState>No decisions recorded yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Decision</th>
                  <th className="px-3 py-2 font-semibold">Step</th>
                  <th className="px-3 py-2 font-semibold">Workflow</th>
                  <th className="px-3 py-2 font-semibold">Decided by</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                  <th className="px-3 py-2 font-semibold">Decided at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-sm">
                {decided.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="px-3 py-3">
                      <Pill className={statusClass(a.status)}>
                        {a.status === "approved" ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Rejected
                          </span>
                        )}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {a.context?.node_label ?? a.node_executions?.node_id ?? "Step"}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {a.node_executions?.runs?.programs?.name ?? "Unknown workflow"}
                    </td>
                    <td className="px-3 py-3 text-xs">{approverLabel(a)}</td>
                    <td className="max-w-[240px] px-3 py-3 text-xs text-muted-foreground">
                      {a.decision_note || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(a.decided_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelSection>
    </div>
  );
}
