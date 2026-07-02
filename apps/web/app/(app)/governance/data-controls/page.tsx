import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Database, FileSearch, Trash2 } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { loadGovernanceInventory } from "@/lib/compliance/governance-server";
import { EmptyState, PanelSection, Pill, statusClass } from "../_components/ui";
import { DataControlsForm, type DataControlSettings } from "./data-controls-form";

export const metadata = {
  title: "Data Controls — Governance & Compliance",
};

export default async function GovernanceDataControlsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");
  const canManage = activeWorkspace.role === "owner" || activeWorkspace.role === "admin";

  const db = createServiceClient() as ReturnType<typeof createServiceClient> & {
    from(table: string): any;
  };

  const [{ data: workspaceRow }, inventory] = await Promise.all([
    db
      .from("workspaces")
      .select(
        "compliance_mode, pii_mode, execution_log_retention_days, prompt_retention_days, output_retention_days, approval_record_retention_days, store_full_prompts, store_full_outputs, data_region"
      )
      .eq("id", activeWorkspace.workspaceId)
      .maybeSingle(),
    loadGovernanceInventory(activeWorkspace.workspaceId, db as never),
  ]);

  const ws = (workspaceRow ?? {}) as Partial<DataControlSettings>;
  const initial: DataControlSettings = {
    compliance_mode: ws.compliance_mode ?? "standard",
    pii_mode: ws.pii_mode ?? "auto",
    execution_log_retention_days: ws.execution_log_retention_days ?? 90,
    prompt_retention_days: ws.prompt_retention_days ?? 0,
    output_retention_days: ws.output_retention_days ?? 0,
    approval_record_retention_days: ws.approval_record_retention_days ?? 365,
    store_full_prompts: ws.store_full_prompts ?? false,
    store_full_outputs: ws.store_full_outputs ?? false,
    data_region: ws.data_region ?? "eu-central-1",
  };

  return (
    <div className="space-y-6 pb-12">
      <section className="border-b border-border pb-6">
        <h1 className="text-3xl font-black tracking-tight">Data controls</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          Decide what workflow data is stored, how long it is kept, and how people can request
          access to or deletion of their data. These controls apply to every workflow in this
          workspace.
        </p>
      </section>

      {/* ── Storage & retention settings ──────────────────────────────────── */}
      <PanelSection
        title="What we store and for how long"
        description="Storage is minimised by default: prompt and output content is fingerprinted, not kept, unless you opt in."
      >
        <DataControlsForm
          workspaceId={activeWorkspace.workspaceId}
          initial={initial}
          canManage={canManage}
        />
      </PanelSection>

      {/* ── Data subject requests ─────────────────────────────────────────── */}
      <PanelSection
        title="Access, export, and deletion requests"
        description="Handle requests from people whose data appears in your workflows (often called DSARs)."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Link
            href="/account/compliance"
            className="group rounded-xl border border-border bg-background/40 p-4 transition-colors hover:bg-accent"
          >
            <FileSearch className="h-4 w-4 text-primary" />
            <p className="mt-2 text-sm font-semibold">Submit a data request</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Request a copy of stored data, a correction, or a restriction from the EU
              Compliance Center.
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
              Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link
            href="/support/data-requests"
            className="group rounded-xl border border-border bg-background/40 p-4 transition-colors hover:bg-accent"
          >
            <Database className="h-4 w-4 text-primary" />
            <p className="mt-2 text-sm font-semibold">Track existing requests</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              See the status and history of data requests submitted for this account.
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
              Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link
            href="/account/compliance"
            className="group rounded-xl border border-border bg-background/40 p-4 transition-colors hover:bg-accent"
          >
            <Trash2 className="h-4 w-4 text-primary" />
            <p className="mt-2 text-sm font-semibold">Delete or export everything</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Download a full export of your data or request account deletion. Deletions are
              recorded in the audit trail.
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
              Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </PanelSection>

      {/* ── Per-workflow data profile ─────────────────────────────────────── */}
      <PanelSection
        title="Data profile per workflow"
        description="What each workflow touches, based on its connectors and settings. Storage and retention above apply to all of them."
      >
        {inventory.records.length === 0 ? (
          <EmptyState>No workflows yet. Create one and its data profile appears here.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Workflow</th>
                  <th className="px-3 py-2 font-semibold">Data sources</th>
                  <th className="px-3 py-2 font-semibold">Personal data</th>
                  <th className="px-3 py-2 font-semibold">Sensitive data</th>
                  <th className="px-3 py-2 font-semibold">DPIA</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-sm">
                {inventory.records.map((record) => (
                  <tr key={record.system_id} className="align-top">
                    <td className="px-3 py-3 font-medium">{record.name}</td>
                    <td className="max-w-[220px] px-3 py-3 text-xs text-muted-foreground">
                      {record.data_sources.join(", ")}
                    </td>
                    <td className="px-3 py-3">
                      <Pill className={statusClass(record.personal_data_processed === "Yes" ? "review" : "active")}>
                        {record.personal_data_processed}
                      </Pill>
                    </td>
                    <td className="px-3 py-3">
                      <Pill className={statusClass(record.special_category_data_processed === "Yes" ? "high risk" : "active")}>
                        {record.special_category_data_processed}
                      </Pill>
                    </td>
                    <td className="px-3 py-3">
                      <Pill className={statusClass(record.dpia_status)}>{record.dpia_status}</Pill>
                    </td>
                    <td className="px-3 py-3">
                      {record.program_id && (
                        <Link
                          href={`/programs/${record.program_id}/settings`}
                          className="inline-flex rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold transition-colors hover:bg-accent"
                        >
                          Workflow settings
                        </Link>
                      )}
                    </td>
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
