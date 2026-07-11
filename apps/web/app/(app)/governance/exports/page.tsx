import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { getRequestUser } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { ExportButtons } from "../_components/export-buttons";
import { AuditExportButtons } from "../_components/audit-export-buttons";
import { EmptyState, PanelSection } from "../_components/ui";

export const metadata = {
  title: "Exports — Governance & Compliance",
};

export default async function GovernanceExportsPage() {
  const user = await getRequestUser();
  if (!user) redirect("/login");

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");

  const db = createServiceClient() as ReturnType<typeof createServiceClient> & {
    from(table: string): any;
  };
  const { data: programRows } = await db
    .from("programs")
    .select("id, name")
    .eq("workspace_id", activeWorkspace.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(100);
  const programs = (programRows ?? []) as Array<{ id: string; name: string }>;
  const { data: dpiaRows } = programs.length
    ? await db
        .from("program_dpia_drafts")
        .select("program_id")
        .in("program_id", programs.map((program) => program.id))
    : { data: [] };
  const dpiaByProgram = new Map<string, number>();
  for (const row of (dpiaRows ?? []) as Array<{ program_id: string }>) {
    dpiaByProgram.set(row.program_id, (dpiaByProgram.get(row.program_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6 pb-12">
      <section className="border-b border-border pb-6">
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Compliance exports</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          Download the evidence an auditor, customer, or regulator asks for — without needing
          an engineer. Every export reflects live data at the moment you download it.
        </p>
      </section>

      <PanelSection
        title="AI system inventory"
        description="The register of every workflow as an AI system record: owners, purpose, data, risk classification, oversight, and review status."
      >
        <ExportButtons />
      </PanelSection>

      <PanelSection
        title="Run audit log"
        description="Workflow executions with models, connectors, policy checks, and human approval decisions. Up to the 1,000 most recent runs."
      >
        <AuditExportButtons />
      </PanelSection>

      <PanelSection
        title="Auditor evidence pack"
        description="A single ZIP with the inventory, per-agent action audits, the full approval history, and a SHA-256 integrity manifest so recipients can verify nothing was changed."
      >
        {/* Plain anchor: this is a file download, not a page navigation. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/governance/evidence-pack"
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Download evidence pack (.zip)
        </a>
      </PanelSection>

      <PanelSection
        title="Per-workflow documents"
        description="Technical documents are generated from live workflow data. DPIA drafts have a dedicated workflow workspace where every generated or edited revision is saved before download."
      >
        {programs.length === 0 ? (
          <EmptyState>No workflows yet.</EmptyState>
        ) : (
          <div className="divide-y divide-border/50">
            {programs.map((program) => {
              const dpia = dpiaByProgram.get(program.id);
              return (
                <div
                  key={program.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{program.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {dpia
                        ? `${dpia} saved DPIA revision${dpia === 1 ? "" : "s"}`
                        : "No saved DPIA draft"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/programs/${program.id}/compliance/export?format=technical-pdf`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold transition-colors hover:bg-accent"
                    >
                      <FileText className="h-3 w-3" />
                      Technical docs (PDF)
                    </a>
                    <Link
                      href={`/governance/dpia/${program.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold transition-colors hover:bg-accent"
                    >
                      <FileText className="h-3 w-3" />
                      {dpia ? "Open saved DPIA drafts" : "Create DPIA draft"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PanelSection>

      <PanelSection
        title="Your personal data"
        description="A machine-readable export of the data Corelyx stores about your account (GDPR right to data portability)."
      >
        {/* Plain anchor: this is a file download, not a page navigation. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/user/export"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" />
          Download my data (JSON)
        </a>
      </PanelSection>
    </div>
  );
}
