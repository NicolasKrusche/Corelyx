import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Gavel,
  History,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { loadGovernanceInventory } from "@/lib/compliance/governance-server";
import type { AiSystemInventoryRecord } from "@/lib/compliance/governance";
import { cn } from "@/lib/utils";

function Metric({
  label,
  value,
  caption,
  icon,
}: {
  label: string;
  value: string | number;
  caption: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border glass-card px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{label}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">{caption}</p>
    </section>
  );
}

function statusClass(status: string) {
  if (/(missing|prohibited|required)/i.test(status)) {
    return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  if (/(complete|active|required|minimal|limited)/i.test(status)) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (/(partial|draft|unknown|review)/i.test(status)) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-border bg-secondary text-muted-foreground";
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium", className)}>
      {children}
    </span>
  );
}

function InventoryRow({ record }: { record: AiSystemInventoryRecord }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-4">
        <div className="min-w-[220px]">
          <p className="text-sm font-semibold text-foreground">{record.name}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{record.system_id}</p>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {record.description}
          </p>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="min-w-[180px] space-y-1 text-xs text-muted-foreground">
          <p>Dept: <span className="text-foreground">{record.department}</span></p>
          <p>Business: <span className="text-foreground">{record.business_owner}</span></p>
          <p>Technical: <span className="text-foreground">{record.technical_owner}</span></p>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex min-w-[180px] flex-wrap gap-1.5">
          <Pill className={statusClass(record.risk_classification)}>{record.risk_classification}</Pill>
          <Pill className={statusClass(record.human_oversight_status)}>{record.human_oversight_status}</Pill>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="min-w-[180px] space-y-1.5">
          <Pill className={statusClass(record.documentation_status)}>{record.documentation_status} docs</Pill>
          <Pill className={statusClass(record.dpia_status)}>{record.dpia_status}</Pill>
          {record.review_due && <Pill className="border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300">Review due</Pill>}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="min-w-[220px] text-xs leading-relaxed text-muted-foreground">
          <p><span className="text-foreground">Models:</span> {record.models_used.join(", ")}</p>
          <p className="mt-1"><span className="text-foreground">Sources:</span> {record.data_sources.join(", ")}</p>
          <p className="mt-1"><span className="text-foreground">Personal data:</span> {record.personal_data_processed}</p>
        </div>
      </td>
    </tr>
  );
}

export default async function GovernancePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");

  const db = createServiceClient();
  const inventory = await loadGovernanceInventory(activeWorkspace.workspaceId, db as never);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ count: auditCount }, { count: runCount }] = await Promise.all([
    (db as any)
      .from("app_logs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", activeWorkspace.workspaceId)
      .gte("created_at", monthAgo),
    (db as any)
      .from("runs")
      .select("id, programs!inner(workspace_id)", { count: "exact", head: true })
      .eq("programs.workspace_id", activeWorkspace.workspaceId)
      .gte("created_at", monthAgo),
  ]);

  const metrics = inventory.metrics;
  const openIssues =
    metrics.systems_lacking_documentation +
    metrics.systems_lacking_oversight +
    metrics.systems_due_for_review;

  return (
    <div className="space-y-6 pb-12 text-foreground">
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            Governance center
          </p>
          <h1 className="text-3xl font-black tracking-tight">AI inventory, risk, documentation, audit, and oversight</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            Every Corelyx workflow is treated as an AI system record. This page automatically inventories workflows,
            classifies risk evidence, highlights missing documentation, tracks oversight coverage, and exports the AI register.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["JSON", "json"],
            ["CSV", "csv"],
            ["Excel", "xlsx"],
            ["PDF", "pdf"],
          ].map(([label, format]) => (
            <Link
              key={format}
              href={`/api/governance/inventory/export?format=${format}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="AI systems" value={metrics.total_ai_systems} caption="Workflows automatically registered." icon={<ClipboardList className="h-4 w-4" />} />
        <Metric label="High risk" value={metrics.high_risk_systems} caption="High-risk or prohibited-use signals." icon={<AlertTriangle className="h-4 w-4" />} />
        <Metric label="Docs missing" value={metrics.systems_lacking_documentation} caption={`${metrics.documentation_coverage_percent}% documentation coverage.`} icon={<FileText className="h-4 w-4" />} />
        <Metric label="Oversight gaps" value={metrics.systems_lacking_oversight} caption={`${metrics.oversight_coverage_percent}% oversight coverage.`} icon={<UserCheck className="h-4 w-4" />} />
        <Metric label="Due review" value={metrics.systems_due_for_review} caption="Never reviewed or older than 180 days." icon={<History className="h-4 w-4" />} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border glass-panel">
          <div className="border-b border-border/50 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">AI inventory</h2>
                <p className="mt-1 text-xs text-muted-foreground">Required fields are populated automatically where the workflow schema has enough evidence.</p>
              </div>
              <Pill className={openIssues > 0 ? statusClass("review") : statusClass("complete")}>
                {openIssues} open issue{openIssues === 1 ? "" : "s"}
              </Pill>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-border/50 bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">System</th>
                  <th className="px-4 py-3 font-semibold">Owners</th>
                  <th className="px-4 py-3 font-semibold">Risk and oversight</th>
                  <th className="px-4 py-3 font-semibold">Evidence</th>
                  <th className="px-4 py-3 font-semibold">Data and models</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {inventory.records.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No AI systems yet. Create a workflow and it will appear in the inventory automatically.
                    </td>
                  </tr>
                ) : (
                  inventory.records.map((record) => <InventoryRow key={record.system_id} record={record} />)
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border glass-card p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Risk distribution</h2>
            </div>
            <div className="mt-4 space-y-3">
              {Object.entries(metrics.risk_distribution).map(([risk, count]) => {
                const pct = metrics.total_ai_systems === 0 ? 0 : Math.round((count / metrics.total_ai_systems) * 100);
                return (
                  <div key={risk}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{risk}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border glass-card p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Governance coverage</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {runCount ?? 0} workflow execution records in the last 30 days.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3">
                <History className="mt-0.5 h-4 w-4 text-blue-500" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {auditCount ?? 0} app-level audit events in the last 30 days.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3">
                <Gavel className="mt-0.5 h-4 w-4 text-amber-500" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {metrics.dpia_required_or_recommended} systems require or should draft a DPIA.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border glass-card p-5">
            <h2 className="text-sm font-semibold">Public compliance tools</h2>
            <div className="mt-4 grid gap-2">
              {[
                ["/tools/ai-act-risk-classifier", "AI Act Risk Classifier"],
                ["/tools/ai-inventory-generator", "AI Inventory Generator"],
                ["/tools/dpia-generator", "DPIA Generator"],
                ["/tools/ai-governance-maturity-assessment", "Maturity Assessment"],
                ["/tools/compliance-documentation-generator", "Documentation Generator"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="rounded-lg border border-border bg-background/40 px-3 py-2 text-xs font-medium transition-colors hover:bg-accent">
                  {label}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
