import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/api";
import {
  ArrowLeft,
  AlertTriangle,
  XCircle,
  Bot,
  Inbox,
  ShieldCheck,
  FileText,
  ListChecks,
  HelpCircle,
  ScrollText,
} from "lucide-react";

export const metadata = { title: "Test Firm — detail", robots: { index: false, follow: false } };

// Full observability for ONE test firm — every run, decision (tool call), report,
// safety flag, approval, connection, and log. Hard-gated on the firm being in the
// test_firms registry RIGHT NOW: removed from the registry → this view 404s.

type Svc = ReturnType<typeof createServiceClient> & { from(t: string): any };

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function money(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

type ToolCall = { name: string; outcome: "ok" | "simulated" | "error"; detail?: string };

function normalizeToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const name = String(o.tool ?? o.tool_id ?? o.name ?? "tool");
    const err = o.error ?? o.error_message;
    const outcome: ToolCall["outcome"] = err ? "error" : o.simulated === true ? "simulated" : "ok";
    return { name, outcome, detail: err ? String(err).slice(0, 200) : undefined };
  });
}

async function loadFirm(workspaceId: string) {
  const db = createServiceClient() as Svc;

  // Registry gate — only firms currently designated are viewable.
  const { data: firmRow } = await db
    .from("test_firms")
    .select("workspace_id, label, notes, created_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!firmRow) return null;
  const firm = firmRow as { workspace_id: string; label: string | null; notes: string | null; created_at: string };

  const { data: wsRow } = await db
    .from("workspaces")
    .select("id, name, compliance_mode")
    .eq("id", workspaceId)
    .maybeSingle();
  const ws = (wsRow ?? {}) as { name?: string | null; compliance_mode?: string | null };

  const [progRes, connRes, flagRes] = await Promise.all([
    db.from("programs").select("id, name, program_type, agent_state, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    db.from("connections").select("id, name, provider, is_valid, last_validated_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    db.from("agent_flags").select("id, origin, status, subject, snippet, reason, categories, source_provider, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
  ]);

  const programs = (progRes.data ?? []) as Array<{ id: string; name: string; program_type: string; agent_state: string | null; created_at: string }>;
  const progName = new Map(programs.map((p) => [p.id, p.name]));
  const programIds = programs.map((p) => p.id);
  const connections = (connRes.data ?? []) as Array<{ id: string; name: string | null; provider: string | null; is_valid: boolean | null; last_validated_at: string | null }>;
  const flags = (flagRes.data ?? []) as Array<{ id: string; origin: string | null; status: string; subject: string | null; snippet: string | null; reason: string | null; categories: string[] | null; source_provider: string | null; created_at: string }>;

  let runs: Array<{ id: string; program_id: string; status: string; triggered_by: string | null; error_message: string | null; total_tokens: number | null; estimated_cost_usd: number | null; created_at: string; completed_at: string | null }> = [];
  let steps: Array<{ id: string; run_id: string; node_id: string; status: string | null; error_message: string | null; provider_id: string | null; model_id: string | null; tool_calls: unknown; output_payload: Record<string, unknown> | null; created_at: string }> = [];
  let reports: Array<{ id: string; program_id: string; title: string | null; data: Record<string, unknown> | null; dry_run: boolean | null; created_at: string }> = [];
  let logs: Array<{ id: string; level: string; source: string; event: string; status: string; message: string; program_id: string | null; created_at: string }> = [];
  let approvals: Array<{ id: string; status: string; context: Record<string, unknown> | null; decision_note: string | null; created_at: string }> = [];

  if (programIds.length > 0) {
    const [runRes, repRes, logRes] = await Promise.all([
      db.from("runs").select("id, program_id, status, triggered_by, error_message, total_tokens, estimated_cost_usd, created_at, completed_at").in("program_id", programIds).order("created_at", { ascending: false }).limit(60),
      db.from("agent_reports").select("id, program_id, title, data, dry_run, created_at").in("program_id", programIds).order("created_at", { ascending: false }).limit(30),
      db.from("app_logs").select("id, level, source, event, status, message, program_id, created_at").in("program_id", programIds).order("created_at", { ascending: false }).limit(120),
    ]);
    runs = (runRes.data ?? []) as typeof runs;
    reports = (repRes.data ?? []) as typeof reports;
    logs = (logRes.data ?? []) as typeof logs;

    const runIds = runs.map((r) => r.id);
    if (runIds.length > 0) {
      const [stepRes, apprRes] = await Promise.all([
        db.from("node_executions").select("id, run_id, node_id, status, error_message, provider_id, model_id, tool_calls, output_payload, created_at").in("run_id", runIds).order("created_at", { ascending: false }).limit(300),
        db.from("approvals").select("id, status, context, decision_note, created_at").order("created_at", { ascending: false }).limit(200),
      ]);
      steps = (stepRes.data ?? []) as typeof steps;
      const progIdSet = new Set(programIds);
      approvals = ((apprRes.data ?? []) as typeof approvals).filter((a) => {
        const pid = a.context?.program_id;
        return typeof pid === "string" && progIdSet.has(pid);
      }).slice(0, 50);
    }
  }

  // Flatten tool calls across steps = the decision trail.
  const decisions = steps.flatMap((s) => {
    const calls = normalizeToolCalls(s.tool_calls ?? (s.output_payload?.tool_calls));
    return calls.map((c) => ({ ...c, runId: s.run_id, nodeId: s.node_id, at: s.created_at }));
  });

  const totalSpend = runs.reduce((sum, r) => sum + (r.estimated_cost_usd ?? 0), 0);
  const risk = {
    pendingFlags: flags.filter((f) => f.status === "pending").length,
    failedRuns: runs.filter((r) => r.status === "failed").length,
    erroredSteps: steps.filter((s) => s.status === "failed").length,
    refusedCalls: decisions.filter((d) => d.outcome === "error").length,
    invalidConnections: connections.filter((c) => c.is_valid === false).length,
    errorLogs: logs.filter((l) => l.level === "error").length,
    openApprovals: approvals.filter((a) => a.status === "pending").length,
  };

  return {
    firm,
    name: firm.label || ws.name || "Untitled workspace",
    complianceMode: ws.compliance_mode ?? "standard",
    programs,
    progName,
    connections,
    flags,
    runs,
    steps,
    decisions,
    reports,
    logs,
    approvals,
    totalSpend,
    risk,
  };
}

function StatusPill({ status }: { status: string | null }) {
  const s = status ?? "—";
  const tone =
    s === "success" || s === "completed"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : s === "failed" || s === "rejected"
        ? "bg-red-500/15 text-red-700 dark:text-red-300"
        : s === "running" || s === "pending" || s === "waiting_approval"
          ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
          : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{s}</span>;
}

export default async function TestFirmDetailPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasTechnicalAccess(user.id, user.email))) redirect("/admin");

  const d = await loadFirm(workspaceId);
  if (!d) notFound(); // not in the registry (or never was) → no deep view

  const riskItems = [
    { label: "Pending flags", value: d.risk.pendingFlags, Icon: AlertTriangle, bad: d.risk.pendingFlags > 0 },
    { label: "Failed runs", value: d.risk.failedRuns, Icon: XCircle, bad: d.risk.failedRuns > 0 },
    { label: "Errored steps", value: d.risk.erroredSteps, Icon: XCircle, bad: d.risk.erroredSteps > 0 },
    { label: "Refused/blocked calls", value: d.risk.refusedCalls, Icon: ShieldCheck, bad: d.risk.refusedCalls > 0 },
    { label: "Invalid inboxes", value: d.risk.invalidConnections, Icon: Inbox, bad: d.risk.invalidConnections > 0 },
    { label: "Error logs", value: d.risk.errorLogs, Icon: ScrollText, bad: d.risk.errorLogs > 0 },
    { label: "Open approvals", value: d.risk.openApprovals, Icon: HelpCircle, bad: d.risk.openApprovals > 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/test-firms" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All test firms
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">{d.name}</h1>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${d.complianceMode === "eu_only" ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" : "bg-muted text-muted-foreground"}`}>
            <ShieldCheck className="h-3 w-3" />
            {d.complianceMode === "eu_only" ? "EU-only" : "Standard"}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground/60">{d.firm.workspace_id} · registered {fmt(d.firm.created_at)} · total spend {money(d.totalSpend)}</p>
        {d.firm.notes && <p className="mt-1 text-sm text-muted-foreground">{d.firm.notes}</p>}
      </div>

      {/* Risk summary — everything that could flag an issue */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {riskItems.map((r) => (
          <div key={r.label} className={`rounded-lg border p-3 ${r.bad ? "border-red-500/30 bg-red-500/10" : "border-border bg-card"}`}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <r.Icon className={`h-3.5 w-3.5 ${r.bad ? "text-red-500" : "text-muted-foreground/60"}`} />
              {r.label}
            </div>
            <p className={`mt-1 text-xl font-bold ${r.bad ? "text-red-700 dark:text-red-300" : "text-foreground"}`}>{r.value}</p>
          </div>
        ))}
      </div>

      {/* Safety flags */}
      <Section title="Safety flags" Icon={AlertTriangle} count={d.flags.length}>
        {d.flags.length === 0 ? <Empty text="No flags." /> : (
          <ul className="divide-y divide-border/60">
            {d.flags.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{f.subject ?? "Flagged message"}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{f.origin === "agent" ? "agent" : "auto"}</span>
                    {(f.categories ?? []).map((c) => (
                      <span key={c} className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] capitalize text-red-600 dark:text-red-400">{c.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                  {f.reason && <p className="text-xs text-muted-foreground">{f.reason}</p>}
                  {f.snippet && <p className="truncate text-xs italic text-muted-foreground/60">“{f.snippet}”</p>}
                </div>
                <div className="shrink-0 text-right">
                  <StatusPill status={f.status} />
                  <p className="mt-0.5 text-[10px] text-muted-foreground/60">{fmt(f.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Runs */}
      <Section title="Runs" Icon={ListChecks} count={d.runs.length}>
        {d.runs.length === 0 ? <Empty text="No runs." /> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-2">Agent</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Trigger</th><th className="px-4 py-2">Cost</th><th className="px-4 py-2">When</th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {d.runs.slice(0, 40).map((r) => (
                <tr key={r.id}>
                  <td className="max-w-[200px] truncate px-4 py-2 text-foreground">{d.progName.get(r.program_id) ?? r.program_id}</td>
                  <td className="px-4 py-2"><StatusPill status={r.status} />{r.error_message && <span className="ml-1 text-xs text-red-500" title={r.error_message}>⚠</span>}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.triggered_by ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.estimated_cost_usd ? money(r.estimated_cost_usd) : "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground/60">{fmt(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Decisions = tool calls */}
      <Section title="Decisions (tool calls)" Icon={Bot} count={d.decisions.length}>
        {d.decisions.length === 0 ? <Empty text="No tool calls recorded." /> : (
          <ul className="divide-y divide-border/60">
            {d.decisions.slice(0, 120).map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-1.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${c.outcome === "error" ? "bg-red-500" : c.outcome === "simulated" ? "bg-amber-400" : "bg-emerald-500"}`} />
                  <span className="font-mono text-xs text-foreground">{c.name}</span>
                  {c.detail && <span className="truncate text-xs text-red-500">{c.detail}</span>}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground/60">{c.nodeId} · {fmt(c.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Reports */}
      <Section title="Agent reports" Icon={FileText} count={d.reports.length}>
        {d.reports.length === 0 ? <Empty text="No reports." /> : (
          <ul className="divide-y divide-border/60">
            {d.reports.map((r) => {
              const outcome = (r.data?.outcome as string | undefined) ?? null;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="truncate text-foreground">{r.title ?? "Report"}{r.dry_run ? <span className="ml-1 text-[10px] text-muted-foreground/60">(dry run)</span> : null}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {outcome && <StatusPill status={outcome === "success" ? "success" : outcome === "failed" ? "failed" : "pending"} />}
                    <span className="text-[10px] text-muted-foreground/60">{fmt(r.created_at)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Approvals / questions */}
      <Section title="Approvals & questions" Icon={HelpCircle} count={d.approvals.length}>
        {d.approvals.length === 0 ? <Empty text="None." /> : (
          <ul className="divide-y divide-border/60">
            {d.approvals.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="truncate text-foreground/80">{String(a.context?.kind ?? "approval")}{a.decision_note ? <span className="text-muted-foreground/60"> — {a.decision_note}</span> : null}</span>
                <span className="flex shrink-0 items-center gap-2"><StatusPill status={a.status} /><span className="text-[10px] text-muted-foreground/60">{fmt(a.created_at)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Inboxes / connections + Agents side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Inboxes & connections" Icon={Inbox} count={d.connections.length}>
          {d.connections.length === 0 ? <Empty text="None." /> : (
            <ul className="divide-y divide-border/60">
              {d.connections.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c.is_valid === false ? "bg-red-500" : "bg-emerald-500"}`} /><span className="text-foreground">{c.name ?? "Connection"}</span><span className="text-[10px] text-muted-foreground/60">{c.provider}</span></span>
                  <span className="text-[10px] text-muted-foreground/60">{fmt(c.last_validated_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Agents & workflows" Icon={Bot} count={d.programs.length}>
          {d.programs.length === 0 ? <Empty text="None." /> : (
            <ul className="divide-y divide-border/60">
              {d.programs.slice(0, 50).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="truncate text-foreground">{p.name}<span className="ml-1 text-[10px] text-muted-foreground/60">{p.program_type}</span></span>
                  <StatusPill status={p.agent_state} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Logs */}
      <Section title="Activity log" Icon={ScrollText} count={d.logs.length}>
        {d.logs.length === 0 ? <Empty text="No logs." /> : (
          <ul className="divide-y divide-border/60 font-mono text-xs">
            {d.logs.map((l) => (
              <li key={l.id} className="flex items-start gap-2 px-4 py-1.5">
                <span className={`mt-0.5 shrink-0 ${l.level === "error" ? "text-red-600 dark:text-red-400" : l.level === "warning" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60"}`}>{l.level}</span>
                <span className="shrink-0 text-muted-foreground/60">{l.source}</span>
                <span className="min-w-0 flex-1 truncate text-foreground/80">{l.event}: {l.message}</span>
                <span className="shrink-0 text-muted-foreground/40">{fmt(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, Icon, count, children }: { title: string; Icon: typeof Bot; count: number; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{count}</span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-4 text-sm text-muted-foreground/60">{text}</p>;
}
