import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  ExternalLink,
  FileDown,
  FileText,
  ListChecks,
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import {
  canView,
  canRun,
  canEdit,
  getProgramAccess,
} from "@/lib/workspaces";
import { isDestructiveAgentTool } from "@/lib/genesis/agent-tools";
import { AgentReport } from "@/components/ui/agent-report";
import {
  AiGeneratedContentNotice,
  AiIdentityBadge,
} from "@/components/ai-transparency";
import { AgentActions } from "./agent-actions";
import { AgentQuestion } from "./agent-question";
import { AgentSchedule } from "./agent-schedule";
import { AgentPermissions } from "./agent-permissions";

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

const STATE_STYLES: Record<string, string> = {
  awaiting_approval:
    "text-amber-600 bg-amber-500/10 ring-amber-500/25 dark:text-amber-400",
  running: "text-primary bg-primary/10 ring-primary/25",
  completed:
    "text-emerald-600 bg-emerald-500/10 ring-emerald-500/25 dark:text-emerald-400",
  failed: "text-destructive bg-destructive/10 ring-destructive/25",
  approved: "text-blue-600 bg-blue-500/10 ring-blue-500/25 dark:text-blue-400",
};

// Per-step execution dot colour for the plan & activity timeline.
const EXEC_DOT: Record<string, string> = {
  running: "bg-primary animate-pulse ring-4 ring-primary/15",
  completed: "bg-emerald-500",
  failed: "bg-destructive",
  skipped: "bg-muted-foreground/40",
};

const RUN_STATUS_STYLES: Record<string, string> = {
  completed:
    "text-emerald-600 bg-emerald-500/10 ring-emerald-500/25 dark:text-emerald-400",
  failed: "text-destructive bg-destructive/10 ring-destructive/25",
  running: "text-primary bg-primary/10 ring-primary/25",
};

const TRIGGER_LABELS: Record<string, string> = {
  agent_manual: "Manual run",
  agent_dry_run: "Dry run",
  agent_cron: "Scheduled run",
  cron: "Scheduled run",
};

function StateChip({ state }: { state: string }) {
  const style =
    STATE_STYLES[state] ?? "text-muted-foreground bg-muted/40 ring-border/60";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${style}`}
    >
      {STATE_LABELS[state] ?? state}
    </span>
  );
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getProgramAccess(id, user.id);
  if (!canView(access)) notFound();

  const service = createServiceClient() as ReturnType<
    typeof createServiceClient
  > & { from(t: string): any };

  const { data: prog } = await service
    .from("programs")
    .select(
      "id, name, description, program_type, agent_state, agent_saved_template, agent_discard_after_run, schema"
    )
    .eq("id", id)
    .maybeSingle();

  const program = prog as {
    id: string;
    name: string;
    description: string | null;
    program_type: string | null;
    agent_state: string | null;
    agent_saved_template: boolean | null;
    agent_discard_after_run: boolean | null;
    schema: Record<string, unknown> | null;
  } | null;

  if (!program || program.program_type !== "agent") notFound();

  const state = program.agent_state ?? "draft";
  const schemaMeta = (program.schema?.metadata && typeof program.schema.metadata === "object"
    ? (program.schema.metadata as Record<string, unknown>)
    : {});
  const caps = (schemaMeta.capabilities && typeof schemaMeta.capabilities === "object"
    ? (schemaMeta.capabilities as Record<string, unknown>)
    : {});
  const allowWrites = caps.allow_writes !== false; // default: may make changes
  const maxCostUsd = typeof caps.max_cost_usd === "number" ? caps.max_cost_usd : null;
  const allowSpawning = caps.allow_spawning !== false; // default: allowed
  const maxSpawns = typeof caps.max_spawns === "number" ? caps.max_spawns : null;
  const rawNodes = (
    Array.isArray(program.schema?.nodes) ? program.schema!.nodes : []
  ) as RawNode[];
  const planNodes = rawNodes.filter(
    (n) => n.type !== "note" && n.type !== "group" && n.type !== "trigger"
  );

  const { data: runRows } = await service
    .from("runs")
    .select("id, status, error_message, triggered_by, created_at, billed_cost_usd")
    .eq("program_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  const latestRun = (runRows?.[0] ?? null) as {
    id: string;
    status: string;
    error_message: string | null;
    triggered_by: string | null;
    created_at: string;
    billed_cost_usd: number | null;
  } | null;

  let summary: string | null = null;
  // node_id → execution state, for the plan & activity timeline.
  type NodeExec = {
    status: string;
    error_message: string | null;
    toolCalls: Array<{ tool: string; ok: boolean; simulated: boolean; error?: string }>;
  };
  const execByNode = new Map<string, NodeExec>();
  let reports: Array<{
    id: string;
    title: string;
    body: string;
    data: unknown;
    dry_run: boolean;
    created_at: string;
  }> = [];
  let pendingQuestions: Array<{ id: string; question: string }> = [];

  const nodeExecIds: string[] = [];
  if (latestRun) {
    const { data: nodeExecs } = await service
      .from("node_executions")
      .select("id, node_id, status, error_message, output_payload")
      .eq("run_id", latestRun.id);
    for (const ne of (nodeExecs ?? []) as Array<{
      id: string;
      node_id: string;
      status: string | null;
      error_message: string | null;
      output_payload: Record<string, unknown> | null;
    }>) {
      if (ne.id) nodeExecIds.push(ne.id);
      const s = ne.output_payload?.summary;
      if (typeof s === "string" && s.trim()) summary = s;
      const rawCalls = ne.output_payload?.tool_calls;
      const toolCalls = Array.isArray(rawCalls)
        ? (rawCalls as Array<Record<string, unknown>>)
            .filter((c) => typeof c?.tool === "string")
            .map((c) => ({
              tool: c.tool as string,
              ok: c.ok === true,
              simulated: c.simulated === true,
              error: typeof c.error === "string" ? c.error : undefined,
            }))
        : [];
      if (ne.node_id) {
        execByNode.set(ne.node_id, {
          status: ne.status ?? "pending",
          error_message: ne.error_message,
          toolCalls,
        });
      }
    }

    const { data: reportRows } = await service
      .from("agent_reports")
      .select("id, title, body, data, dry_run, created_at")
      .eq("run_id", latestRun.id)
      .order("created_at", { ascending: true });
    reports = (reportRows ?? []) as typeof reports;

    // Pending questions the agent asked mid-run (corelyx.ask_user) — the run is
    // paused until these are answered.
    if (nodeExecIds.length > 0) {
      const { data: questionRows } = await service
        .from("approvals")
        .select("id, status, context, node_execution_id")
        .in("node_execution_id", nodeExecIds)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      pendingQuestions = ((questionRows ?? []) as Array<{ id: string; context: Record<string, unknown> | null }>)
        .filter((r) => r.context?.kind === "question" && typeof r.context?.question === "string")
        .map((r) => ({ id: r.id, question: r.context!.question as string }));
    }
  }

  const userCanRun = canRun(access);
  const userCanEdit = canEdit(access);
  const isRunning = state === "running";
  const hasActivity = execByNode.size > 0;
  const runDate = latestRun
    ? new Date(latestRun.created_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-2">
      {/* ── Top bar: breadcrumb + run links ───────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Agents
        </Link>
        {latestRun && (
          <div className="flex items-center gap-4">
            <Link
              href={`/programs/${program.id}/runs/${latestRun.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              View full log <ExternalLink className="h-3 w-3" />
            </Link>
            <a
              href={`/api/agents/${program.id}/audit`}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              download
            >
              Export audit <FileDown className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* ── Hero: identity + actions in one card ──────── */}
      <div className="overflow-hidden rounded-2xl border glass-card">
        <div className="flex items-start gap-4 px-6 pb-5 pt-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">{program.name}</h1>
              <AiIdentityBadge label="AI agent" />
              <StateChip state={state} />
              {program.agent_saved_template && (
                <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Saved
                </span>
              )}
            </div>
            {program.description && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {program.description}
              </p>
            )}
          </div>
        </div>
        <div className="border-t border-border/50 px-6 py-4">
          <AgentActions
            agentId={program.id}
            state={state}
            savedTemplate={program.agent_saved_template === true}
            canRun={userCanRun}
            canEdit={userCanEdit}
          />
        </div>
      </div>

      {/* ── Pending agent questions (run is paused) ───── */}
      {pendingQuestions.map((q) => (
        <AgentQuestion key={q.id} approvalId={q.id} question={q.question} />
      ))}

      {/* ── Body: report + timeline | config sidebar ──── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {/* Agent report — the main deliverable */}
          <section id="agent-report" className="scroll-mt-6 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold">Agent report</h2>
              {isRunning && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                  working…
                </span>
              )}
            </div>

            {reports.map((report) => (
              <AgentReport
                key={report.id}
                title={report.title}
                body={report.body}
                dryRun={report.dry_run}
                data={report.data}
              />
            ))}

            {isRunning && (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed px-5 py-4 text-sm text-muted-foreground">
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                <span>
                  {reports.length > 0
                    ? "The agent is still working — more may appear here."
                    : "The agent is working. Its report will appear here when it's ready."}
                </span>
              </div>
            )}

            {/* Legacy runs may have finished with only a plain-text summary. */}
            {!isRunning && reports.length === 0 && summary && (
              <div className="rounded-2xl border glass-panel p-5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {summary}
                </p>
                <AiGeneratedContentNotice
                  contentKind="summary"
                  className="mt-4 border-t border-border/40 pt-2 italic"
                />
              </div>
            )}

            {!isRunning && reports.length === 0 && !summary && (
              <div className="flex flex-col items-center rounded-2xl border border-dashed px-5 py-10 text-center">
                <Sparkles className="h-6 w-6 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium">No report yet</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Run the agent (or try a dry run) and its report will appear
                  here.
                </p>
              </div>
            )}

            {latestRun?.error_message && (
              <div className="flex items-start gap-2 rounded-2xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {latestRun.error_message}
              </div>
            )}
          </section>

          {/* Plan & activity — one timeline, live status per step */}
          <section className="rounded-2xl border glass-panel">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">
                  {hasActivity ? "Plan & activity" : "Execution plan"}
                </h2>
                <AiIdentityBadge label="AI plan" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {planNodes.length} step{planNodes.length !== 1 ? "s" : ""}
                </span>
                {isRunning && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    live
                  </span>
                )}
              </div>
            </div>

            <ol className="px-5 py-2">
              {planNodes.map((node, i) => {
                const isTask = node.type === "agent_task";
                const tools =
                  isTask && Array.isArray(node.config?.tools)
                    ? (node.config!.tools as string[])
                    : [];
                const requiresApproval =
                  isTask && node.config?.requires_approval === true;
                const hasDestructive = tools.some(isDestructiveAgentTool);
                const exec = execByNode.get(node.id);
                const status = exec?.status;
                const isLast = i === planNodes.length - 1;

                return (
                  <li key={node.id} className="relative flex gap-4 pb-1">
                    {/* Timeline rail: status dot (or step number) + connector */}
                    <div className="flex flex-col items-center">
                      {status ? (
                        <span
                          className={`mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                            EXEC_DOT[status] ?? "bg-muted-foreground/30"
                          }`}
                        />
                      ) : (
                        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                          {i + 1}
                        </span>
                      )}
                      {!isLast && (
                        <span className="mt-1 w-px flex-1 bg-border/60" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {node.label ?? node.id}
                        </span>
                        {status && (
                          <span className="text-[11px] capitalize text-muted-foreground">
                            {status}
                          </span>
                        )}
                        {requiresApproval && (
                          <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-400">
                            needs approval
                          </span>
                        )}
                        {hasDestructive && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive ring-1 ring-destructive/25">
                            <ShieldAlert className="h-2.5 w-2.5" /> changes data
                          </span>
                        )}
                      </div>

                      {node.description && (
                        <p className="text-xs text-muted-foreground">
                          {node.description}
                        </p>
                      )}
                      {isTask && typeof node.config?.objective === "string" && (
                        <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs italic text-muted-foreground">
                          &ldquo;{node.config.objective as string}&rdquo;
                        </p>
                      )}

                      {/* Live tool calls once the step ran; configured tools before */}
                      {exec && exec.toolCalls.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {exec.toolCalls.map((c, j) => (
                            <span
                              key={`${c.tool}-${j}`}
                              title={c.error}
                              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                                !c.ok
                                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                                  : c.simulated
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "border-border bg-muted/40 text-muted-foreground"
                              }`}
                            >
                              <Wrench className="h-2.5 w-2.5" />
                              {c.tool}
                              {c.simulated && c.ok ? " (simulated)" : ""}
                            </span>
                          ))}
                        </div>
                      ) : (
                        tools.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {tools.map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                              >
                                <Wrench className="h-2.5 w-2.5" />
                                {t}
                              </span>
                            ))}
                          </div>
                        )
                      )}

                      {exec?.error_message && (
                        <p className="text-[11px] text-destructive">
                          {exec.error_message}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}

              {planNodes.length === 0 && (
                <li className="py-5 text-sm text-muted-foreground">
                  This agent has no executable steps.
                </li>
              )}
            </ol>
          </section>
        </div>

        {/* ── Sidebar: run status + configuration ──────── */}
        <aside className="space-y-6">
          {latestRun && (
            <div className="rounded-2xl border glass-panel px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Latest run</p>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
                    RUN_STATUS_STYLES[latestRun.status] ??
                    "bg-muted/40 text-muted-foreground ring-border/60"
                  }`}
                >
                  {latestRun.status}
                </span>
              </div>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="font-medium">{runDate}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Trigger</dt>
                  <dd className="font-medium">
                    {TRIGGER_LABELS[latestRun.triggered_by ?? ""] ??
                      latestRun.triggered_by ??
                      "—"}
                  </dd>
                </div>
                {typeof latestRun.billed_cost_usd === "number" &&
                  latestRun.billed_cost_usd > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">AI cost</dt>
                      <dd className="font-medium tabular-nums">
                        ~$
                        {latestRun.billed_cost_usd.toFixed(
                          latestRun.billed_cost_usd < 0.01 ? 4 : 2
                        )}
                      </dd>
                    </div>
                  )}
              </dl>
            </div>
          )}

          <AgentPermissions
            agentId={program.id}
            allowWrites={allowWrites}
            maxCostUsd={maxCostUsd}
            allowSpawning={allowSpawning}
            maxSpawns={maxSpawns}
            canEdit={userCanEdit}
          />
          <AgentSchedule agentId={program.id} canEdit={userCanEdit} />
        </aside>
      </div>
    </div>
  );
}
