import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Gavel,
  History,
  Scale,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { loadGovernanceInventory } from "@/lib/compliance/governance-server";
import {
  buildRemediationActions,
  type AiSystemInventoryRecord,
  type RemediationAction,
} from "@/lib/compliance/governance";
import { cn } from "@/lib/utils";
import { MarkReviewedButton } from "./_components/mark-reviewed-button";
import { GovernanceRemediationButton } from "./_components/governance-remediation-button";
import { ExportButtons } from "./_components/export-buttons";
import { Pill, statusClass } from "./_components/ui";

// ─── Small display components ────────────────────────────────────────────────

function Metric({
  label,
  value,
  caption,
  icon,
  href,
}: {
  label: string;
  value: string | number;
  caption: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{label}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">{caption}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block rounded-xl border glass-card px-5 py-4 transition-colors hover:bg-accent/40">
        {body}
      </Link>
    );
  }
  return <section className="rounded-xl border glass-card px-5 py-4">{body}</section>;
}

// ─── Inventory row with per-record quick-fix actions ──────────────────────────

function InventoryRow({ record }: { record: AiSystemInventoryRecord }) {
  const isPotentiallyProhibited =
    record.risk_classification === "Potentially Prohibited Use";
  const needsTransparencyNotice =
    record.ai_act_risk_level === "transparency" &&
    !record.transparency_notice_required;
  const needsHighRiskDocumentation =
    record.risk_classification === "High Risk" &&
    !record.high_risk_documentation_required;
  const hasActions =
    (record.review_due && !!record.program_id) ||
    (record.documentation_status !== "Complete" && !!record.program_id) ||
    (record.human_oversight_status.startsWith("Missing") && !!record.program_id) ||
    (isPotentiallyProhibited && record.deployment_status === "Active" && !!record.program_id) ||
    (needsTransparencyNotice && !!record.program_id) ||
    (needsHighRiskDocumentation && !!record.program_id) ||
    record.dpia_status === "Required" ||
    record.dpia_status === "Draft recommended";

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
          {needsTransparencyNotice && (
            <Pill className="border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              Transparency notice missing
            </Pill>
          )}
          {record.review_due && (
            <Pill className="border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300">
              Review due
            </Pill>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="min-w-[220px] text-xs leading-relaxed text-muted-foreground">
          <p><span className="text-foreground">Models:</span> {record.models_used.join(", ")}</p>
          <p className="mt-1"><span className="text-foreground">Sources:</span> {record.data_sources.join(", ")}</p>
          <p className="mt-1"><span className="text-foreground">Personal data:</span> {record.personal_data_processed}</p>
        </div>
      </td>
      {/* Quick-fix actions column */}
      <td className="px-4 py-4">
        {hasActions ? (
          <div className="flex min-w-[170px] flex-col gap-1.5">
            {isPotentiallyProhibited && record.deployment_status === "Active" && record.program_id && (
              <GovernanceRemediationButton
                programId={record.program_id}
                kind="suspend"
                label="Suspend workflow"
                doneLabel="Workflow suspended"
                confirmMessage="Suspend this workflow now? Potentially prohibited AI practices should not remain active while legal review is pending."
                destructive
              />
            )}
            {record.review_due && record.program_id && (
              <MarkReviewedButton programId={record.program_id} />
            )}
            {record.human_oversight_status.startsWith("Missing") && record.program_id && (
              <>
                <GovernanceRemediationButton
                  programId={record.program_id}
                  kind="require-oversight"
                  label="Require human oversight"
                  doneLabel="Oversight required"
                />
                <Link
                  href={`/programs/${record.program_id}/editor`}
                  className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
                >
                  <UserCheck className="h-3 w-3" />
                  Add approval gate in editor
                </Link>
              </>
            )}
            {needsTransparencyNotice && record.program_id && (
              <GovernanceRemediationButton
                programId={record.program_id}
                kind="require-transparency"
                label="Require transparency notice"
                doneLabel="Notice requirement recorded"
              />
            )}
            {needsHighRiskDocumentation && record.program_id && (
              <GovernanceRemediationButton
                programId={record.program_id}
                kind="require-documentation"
                label="Require technical documentation"
                doneLabel="Documentation required"
              />
            )}
            {record.documentation_status !== "Complete" && record.program_id && (
              <Link
                href={`/programs/${record.program_id}/settings`}
                className="inline-flex items-center gap-1 rounded border border-border bg-background/60 px-2 py-1 text-[11px] font-medium transition-colors hover:bg-accent"
              >
                <FileText className="h-3 w-3" />
                Fix documentation
              </Link>
            )}
            {record.dpia_status === "Required" && (
              <Link
                href={record.program_id ? `/api/programs/${record.program_id}/compliance/export?format=dpia-pdf` : "/tools/dpia-generator"}
                className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-500/20 dark:text-red-300"
              >
                <Scale className="h-3 w-3" />
                Download DPIA draft
              </Link>
            )}
            {record.dpia_status === "Draft recommended" && (
              <Link
                href={record.program_id ? `/api/programs/${record.program_id}/compliance/export?format=dpia-pdf` : "/tools/dpia-generator"}
                className="inline-flex items-center gap-1 rounded border border-border bg-background/60 px-2 py-1 text-[11px] font-medium transition-colors hover:bg-accent"
              >
                <BookOpen className="h-3 w-3" />
                Download DPIA draft
              </Link>
            )}
            {record.program_id && record.documentation_status !== "Complete" && (
              <Link
                href={`/api/programs/${record.program_id}/compliance/export?format=technical-pdf`}
                className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] font-medium transition-colors hover:bg-accent"
              >
                <Download className="h-3 w-3" />
                Download technical draft
              </Link>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            No gaps
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Compliance action plan ────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: {
    badge: "bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-300",
    border: "border-l-red-500",
    icon: <XCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />,
    label: "Critical",
  },
  required: {
    badge: "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300",
    border: "border-l-amber-500",
    icon: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />,
    label: "Required",
  },
  recommended: {
    badge: "bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300",
    border: "border-l-blue-500",
    icon: <Gavel className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />,
    label: "Recommended",
  },
} as const;

function RemediationCard({ action }: { action: RemediationAction }) {
  const cfg = SEVERITY_CONFIG[action.severity];
  const visibleNames = action.affectedSystemNames.slice(0, 3);
  const overflow = action.affectedSystemNames.length - visibleNames.length;

  return (
    <div className={cn("rounded-xl border-l-4 border border-border glass-card p-5", cfg.border)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider", cfg.badge)}>
              {cfg.label}
            </span>
            <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {action.regulation}
            </span>
            <span className="text-[11px] text-muted-foreground/70">{action.regulationLabel}</span>
          </div>
          <div className="flex items-start gap-2">
            {cfg.icon}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{action.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
              {action.affectedSystemNames.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-medium text-muted-foreground/70">Affects:</span>
                  {visibleNames.map((name) => (
                    <span key={name} className="rounded-md border border-border bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {name}
                    </span>
                  ))}
                  {overflow > 0 && (
                    <span className="text-[11px] text-muted-foreground/70">+{overflow} more</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0">
          <Link
            href={action.actionHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent whitespace-nowrap"
          >
            {action.actionLabel}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── EU regulatory reference ───────────────────────────────────────────────────

const EU_REGULATIONS = [
  {
    code: "EU AI Act Art. 5",
    label: "Prohibited Practices",
    when: "any",
    detail: "Absolute prohibitions — social scoring, manipulative AI, real-time biometric ID in public spaces, emotion recognition in workplaces/education.",
  },
  {
    code: "EU AI Act Art. 9",
    label: "Risk Management",
    when: "any",
    detail: "High-risk systems must have a documented, iterative risk management process covering identification, estimation, evaluation, and mitigation of known risks.",
  },
  {
    code: "EU AI Act Art. 11 · Annex IV",
    label: "Technical Documentation",
    when: "high-risk",
    detail: "Providers of high-risk systems must maintain technical documentation covering purpose, architecture, data governance, performance, risks, and oversight.",
  },
  {
    code: "EU AI Act Art. 13",
    label: "Information for Deployers",
    when: "any",
    detail: "High-risk systems must provide clear instructions so deployers can interpret outputs, understand limitations, and apply human oversight.",
  },
  {
    code: "EU AI Act Art. 50",
    label: "Transparency Notices",
    when: "any",
    detail: "Specific AI interactions and certain generated or manipulated content require disclosure. Review applicability and publish notices at the relevant user touchpoints.",
  },
  {
    code: "EU AI Act Art. 14",
    label: "Human Oversight",
    when: "high-risk",
    detail: "High-risk AI must allow assigned natural persons to understand outputs, intervene, override, or halt the system before consequential actions.",
  },
  {
    code: "EU AI Act Art. 26",
    label: "Deployer Obligations",
    when: "any",
    detail: "Deployers of high-risk systems must follow instructions, assign competent oversight, monitor operation, suspend risky use, and keep controlled logs for at least six months unless another rule applies.",
  },
  {
    code: "EU AI Act Art. 27",
    label: "FRIA",
    when: "high-risk",
    detail: "Certain high-risk deployments require a fundamental-rights impact assessment before use. Applicability depends on deployer role and use case.",
  },
  {
    code: "GDPR Art. 5(2)",
    label: "Accountability",
    when: "any",
    detail: "Controllers must be able to demonstrate that processing is lawful, fair, and transparent — including for AI-assisted decisions.",
  },
  {
    code: "GDPR Art. 35",
    label: "DPIA",
    when: "personal-data",
    detail: "Processing likely to result in high risk requires a DPIA before deployment, including special-category data, profiling, and AI-driven consequential decisions.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GovernancePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");

  const db = createServiceClient();
  const inventory = await loadGovernanceInventory(activeWorkspace.workspaceId, db as never);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ count: auditCount }, { count: runCount }, { count: pendingApprovalCount }] = await Promise.all([
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
    (db as any)
      .from("approvals")
      .select("id, node_executions!inner(runs!inner(programs!inner(workspace_id)))", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("node_executions.runs.programs.workspace_id", activeWorkspace.workspaceId),
  ]);

  const metrics = inventory.metrics;
  const remediationActions = buildRemediationActions(inventory.records, {
    executionLogRetentionDays: inventory.executionLogRetentionDays,
  });
  const openIssues = remediationActions.reduce((sum, action) => sum + action.count, 0);
  const criticalCount = remediationActions.filter((a) => a.severity === "critical").length;
  const requiredCount = remediationActions.filter((a) => a.severity === "required").length;

  return (
    <div className="space-y-6 pb-12 text-foreground">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            AI inventory, risk, documentation, audit, and oversight
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            Every Corelyx workflow is treated as an AI system record. This page automatically
            inventories workflows, classifies risk evidence, surfaces GDPR and EU AI Act
            compliance gaps, and provides direct actions to resolve each one.
          </p>
        </div>
        <ExportButtons />
      </section>

      {/* ── Metrics ────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Metric
          label="AI systems"
          value={metrics.total_ai_systems}
          caption="Workflows automatically registered."
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <Metric
          label="Pending approvals"
          value={pendingApprovalCount ?? 0}
          caption="Runs paused for a human decision. Click to review."
          icon={<UserCheck className="h-4 w-4" />}
          href="/governance/reviews"
        />
        <Metric
          label="High risk"
          value={metrics.high_risk_systems}
          caption="High-risk or prohibited-use signals."
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <Metric
          label="Docs missing"
          value={metrics.systems_lacking_documentation}
          caption={`${metrics.documentation_coverage_percent}% documentation coverage.`}
          icon={<FileText className="h-4 w-4" />}
        />
        <Metric
          label="Oversight gaps"
          value={metrics.systems_lacking_oversight}
          caption={`${metrics.oversight_coverage_percent}% oversight coverage.`}
          icon={<UserCheck className="h-4 w-4" />}
        />
        <Metric
          label="Due review"
          value={metrics.systems_due_for_review}
          caption="Never reviewed or older than 180 days. Click to review."
          icon={<History className="h-4 w-4" />}
          href="/governance/reviews"
        />
      </section>

      {/* ── Compliance Action Plan ─────────────────────────────────────────── */}
      {remediationActions.length > 0 && (
        <section className="rounded-xl border glass-panel">
          <div className="border-b border-border/50 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Compliance action plan</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Each item cites the specific GDPR or EU AI Act article that requires the fix,
                  with a direct action to resolve it.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {criticalCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-bold text-red-700 dark:text-red-300">
                    <XCircle className="h-3 w-3" />
                    {criticalCount} critical
                  </span>
                )}
                {requiredCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    {requiredCount} required
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-3 p-5">
            {remediationActions.map((action) => (
              <RemediationCard key={action.id} action={action} />
            ))}
          </div>
        </section>
      )}

      {remediationActions.length === 0 && inventory.records.length > 0 && (
        <section className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              No compliance gaps detected
            </p>
            <p className="text-xs text-emerald-700/70 dark:text-emerald-300/70">
              All registered AI systems have documentation, oversight, and recent reviews.
              Continue to monitor and re-certify every 180 days.
            </p>
          </div>
        </section>
      )}

      {/* ── Inventory table + sidebar ──────────────────────────────────────── */}
      <section id="inventory" className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border glass-panel">
          <div className="border-b border-border/50 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">AI inventory</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Required fields are populated automatically from the workflow schema.
                  Use the Quick fix column to resolve each gap in place.
                </p>
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
                  <th className="px-4 py-3 font-semibold">Quick fix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {inventory.records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No AI systems yet. Create a workflow and it will appear in the inventory automatically.
                    </td>
                  </tr>
                ) : (
                  inventory.records.map((record) => (
                    <InventoryRow key={record.system_id} record={record} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Risk distribution */}
          <section className="rounded-xl border glass-card p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Risk distribution</h2>
            </div>
            <div className="mt-4 space-y-3">
              {Object.entries(metrics.risk_distribution).map(([risk, count]) => {
                const pct =
                  metrics.total_ai_systems === 0
                    ? 0
                    : Math.round((count / metrics.total_ai_systems) * 100);
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

          {/* Governance coverage */}
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

          {/* EU regulatory reference */}
          <section className="rounded-xl border glass-card p-5">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">EU regulatory reference</h2>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/70">
              Applicable articles based on your workspace risk profile.
            </p>
            <div className="mt-4 divide-y divide-border/50">
              {EU_REGULATIONS.map((reg) => (
                <div key={reg.code} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-semibold text-foreground">{reg.code}</p>
                    <span className="shrink-0 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                      {reg.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
                    {reg.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Public tools */}
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
                <Link
                  key={href}
                  href={href}
                  className="rounded-lg border border-border bg-background/40 px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
                >
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
