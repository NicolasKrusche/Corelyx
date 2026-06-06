import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Sparkles, AlertTriangle, ShieldAlert, Wrench, FileText } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { canView, canRun, canEdit, getProgramAccess } from "@/lib/workspaces";
import { isDestructiveAgentTool } from "@/lib/genesis/agent-tools";
import { Badge } from "@/components/ui/badge";
import { AgentActions } from "./agent-actions";

export const metadata = { robots: { index: false, follow: false } };

type RawNode = {
  id: string;
  type: string;
  label?: string;
  description?: string;
  config?: Record<string, unknown>;
};

const STATE_LABELS: Record<string, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  discarded: "Discarded",
};
const STATE_VARIANT: Record<string, "secondary" | "warning" | "destructive" | "default"> = {
  awaiting_approval: "warning",
  running: "warning",
  completed: "default",
  failed: "destructive",
};

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getProgramAccess(id, user.id);
  if (!canView(access)) notFound();

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };
  const { data: prog } = await service
    .from("programs")
    .select("id, name, description, program_type, agent_state, agent_saved_template, agent_discard_after_run, schema")
    .eq("id", id)
    .maybeSingle();
  const program = prog as {
    id: string; name: string; description: string | null; program_type: string | null;
    agent_state: string | null; agent_saved_template: boolean | null;
    agent_discard_after_run: boolean | null; schema: Record<string, unknown> | null;
  } | null;
  if (!program || program.program_type !== "agent") notFound();

  const state = program.agent_state ?? "draft";
  const rawNodes = (Array.isArray(program.schema?.nodes) ? program.schema!.nodes : []) as RawNode[];
  const planNodes = rawNodes.filter((n) => n.type !== "note" && n.type !== "group" && n.type !== "trigger");

  // Latest run + its agent_task summary, if any.
  const { data: runRows } = await service
    .from("runs")
    .select("id, status, error_message, triggered_by, created_at")
    .eq("program_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  const latestRun = (runRows?.[0] ?? null) as
    | { id: string; status: string; error_message: string | null; triggered_by: string | null; created_at: string }
    | null;

  let summary: string | null = null;
  let reports: Array<{ id: string; title: string; body: string; dry_run: boolean; created_at: string }> = [];
  if (latestRun) {
    const { data: nodeExecs } = await service
      .from("node_executions")
      .select("output_payload")
      .eq("run_id", latestRun.id);
    for (const ne of (nodeExecs ?? []) as Array<{ output_payload: Record<string, unknown> | null }>) {
      const s = ne.output_payload?.summary;
      if (typeof s === "string" && s.trim()) summary = s;
    }

    // Structured reports the agent relayed via corelyx.report_to_user.
    const { data: reportRows } = await service
      .from("agent_reports")
      .select("id, title, body, dry_run, created_at")
      .eq("run_id", latestRun.id)
      .order("created_at", { ascending: true });
    reports = (reportRows ?? []) as typeof reports;
  }

  const userCanRun = canRun(access);
  const userCanEdit = canEdit(access);
  const isRunning = state === "running";

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2">
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Agents
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <h1 className="truncate text-xl font-semibold">{program.name}</h1>
            <Badge variant={STATE_VARIANT[state] ?? "secondary"} className="text-[10px]">
              {STATE_LABELS[state] ?? state}
            </Badge>
          </div>
          {program.description && (
            <p className="mt-1 text-sm text-muted-foreground">{program.description}</p>
          )}
        </div>
      </div>

      {/* The plan the user approves */}
      <div className="rounded-2xl border glass-card p-5">
        <p className="mb-3 text-sm font-semibold">Plan ({planNodes.length} step{planNodes.length !== 1 ? "s" : ""})</p>
        <ol className="space-y-2.5">
          {planNodes.map((node, i) => {
            const isTask = node.type === "agent_task";
            const tools = isTask && Array.isArray(node.config?.tools) ? (node.config!.tools as string[]) : [];
            const requiresApproval = isTask && node.config?.requires_approval === true;
            const hasDestructive = tools.some(isDestructiveAgentTool);
            return (
              <li key={node.id} className="flex gap-3 rounded-lg border border-border/50 bg-background/40 p-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{node.label ?? node.id}</span>
                    {isTask && <Badge variant="secondary" className="text-[10px]"><Wrench className="mr-0.5 h-2.5 w-2.5" />agent task</Badge>}
                    {requiresApproval && <Badge variant="warning" className="text-[10px]">needs approval</Badge>}
                    {hasDestructive && (
                      <Badge variant="destructive" className="text-[10px]"><ShieldAlert className="mr-0.5 h-2.5 w-2.5" />changes data</Badge>
                    )}
                  </div>
                  {node.description && <p className="mt-0.5 text-xs text-muted-foreground">{node.description}</p>}
                  {isTask && typeof node.config?.objective === "string" && (
                    <p className="mt-1 text-xs italic text-muted-foreground">“{node.config.objective as string}”</p>
                  )}
                  {tools.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Tools: {tools.join(", ")}</p>
                  )}
                </div>
              </li>
            );
          })}
          {planNodes.length === 0 && (
            <li className="text-sm text-muted-foreground">This agent has no executable steps.</li>
          )}
        </ol>
      </div>

      {/* Reports the agent relayed back to the user. The anchor lets the Run
          button scroll the user here so they know where output will appear. */}
      {(reports.length > 0 || isRunning) && (
        <div id="agent-report" className="scroll-mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm font-semibold">Agent report</p>
            {isRunning && <Badge variant="warning" className="text-[10px]">working…</Badge>}
          </div>

          {reports.map((report) => (
            <div key={report.id} className="rounded-2xl border glass-card p-5">
              <div className="mb-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{report.title}</p>
                {report.dry_run && <Badge variant="secondary" className="text-[10px]">preview</Badge>}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{report.body}</div>
            </div>
          ))}

          {isRunning && (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed glass-card p-5 text-sm text-muted-foreground">
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <span>
                {reports.length > 0
                  ? "The agent is still working — more may appear here."
                  : "The agent is working. Its report will appear here when it’s ready."}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Latest run result */}
      {latestRun && (
        <div className="rounded-2xl border glass-card p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Latest run</p>
            <div className="flex items-center gap-2">
              {latestRun.triggered_by === "agent_dry_run" && <Badge variant="secondary" className="text-[10px]">dry run</Badge>}
              <Badge variant={latestRun.status === "failed" ? "destructive" : latestRun.status === "completed" ? "default" : "warning"} className="text-[10px]">
                {latestRun.status}
              </Badge>
              <Link href={`/programs/${program.id}/runs/${latestRun.id}`} className="text-xs text-primary hover:underline">View log</Link>
            </div>
          </div>
          {summary && <p className="whitespace-pre-wrap text-sm text-foreground/90">{summary}</p>}
          {latestRun.error_message && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{latestRun.error_message}
            </p>
          )}
          {!summary && !latestRun.error_message && (
            <p className="text-xs text-muted-foreground">No summary recorded for this run.</p>
          )}
        </div>
      )}

      <AgentActions
        agentId={program.id}
        state={state}
        savedTemplate={program.agent_saved_template === true}
        canRun={userCanRun}
        canEdit={userCanEdit}
      />
    </div>
  );
}
