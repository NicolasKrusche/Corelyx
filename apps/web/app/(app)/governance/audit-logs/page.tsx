import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { collectRunAuditLog } from "@/lib/compliance/audit-log";
import { AuditExportButtons } from "../_components/audit-export-buttons";
import { EmptyState, PanelSection, Pill, statusClass } from "../_components/ui";

export const metadata = {
  title: "Audit Logs — Governance & Compliance",
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

function listOrDash(values: string[], max = 3) {
  if (values.length === 0) return "—";
  const shown = values.slice(0, max).join(", ");
  const overflow = values.length - max;
  return overflow > 0 ? `${shown} +${overflow}` : shown;
}

export default async function GovernanceAuditLogsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");

  const db = createServiceClient() as ReturnType<typeof createServiceClient> & {
    from(table: string): any;
  };
  const bundle = await collectRunAuditLog(db, activeWorkspace.workspaceId, 50);

  return (
    <div className="space-y-6 pb-12">
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Audit logs</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            Every workflow run with the models and connectors it used, the policy checks it
            passed, and the human approvals it collected. Download the full log as CSV or PDF
            for auditors — no engineering help needed.
          </p>
        </div>
        <AuditExportButtons />
      </section>

      <PanelSection
        title={`Recent runs (${bundle.records.length})`}
        description="The 50 most recent runs are shown here. Exports include up to 1,000 runs. Evidence rows cannot be edited after they are written."
      >
        {bundle.records.length === 0 ? (
          <EmptyState>
            No runs yet. Once a workflow runs, its audit record appears here automatically.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Workflow / Run</th>
                  <th className="px-3 py-2 font-semibold">Result</th>
                  <th className="px-3 py-2 font-semibold">Actor</th>
                  <th className="px-3 py-2 font-semibold">Models</th>
                  <th className="px-3 py-2 font-semibold">Connector actions</th>
                  <th className="px-3 py-2 font-semibold">Policy checks</th>
                  <th className="px-3 py-2 font-semibold">Approvals</th>
                  <th className="px-3 py-2 font-semibold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-sm">
                {bundle.records.map((record) => (
                  <tr key={record.run_id} className="align-top">
                    <td className="px-3 py-3">
                      <Link
                        href={`/programs/${record.workflow_id}/runs/${record.run_id}`}
                        className="font-medium transition-colors hover:text-primary"
                      >
                        {record.workflow_name}
                      </Link>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {record.run_id}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <Pill className={statusClass(record.status)}>{record.status}</Pill>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {record.actor}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        via {record.triggered_by}
                      </p>
                    </td>
                    <td className="max-w-[180px] px-3 py-3 text-xs text-muted-foreground">
                      {listOrDash(record.models_used)}
                    </td>
                    <td className="max-w-[180px] px-3 py-3 text-xs text-muted-foreground">
                      {listOrDash(record.connector_actions)}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {record.policy_checks_passed + record.policy_checks_flagged === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : record.policy_checks_flagged > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          {record.policy_checks_flagged} flagged
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {record.policy_checks_passed} passed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {record.approvals.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        record.approvals.map((a) => (
                          <Pill key={a.approval_id} className={statusClass(a.status ?? "pending")}>
                            {a.status ?? "pending"}
                          </Pill>
                        ))
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {formatDate(record.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelSection>

      <section className="rounded-xl border glass-card px-5 py-4 text-xs leading-relaxed text-muted-foreground">
        <p>
          Looking for platform events (sign-ins, settings changes, data requests)? They are
          kept in the tamper-protected application log —{" "}
          <Link href="/logs" className="font-medium text-primary underline-offset-2 hover:underline">
            open application logs
          </Link>
          . A complete auditor bundle, including approval history with an integrity manifest, is
          available under{" "}
          <Link href="/governance/exports" className="font-medium text-primary underline-offset-2 hover:underline">
            Exports
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
