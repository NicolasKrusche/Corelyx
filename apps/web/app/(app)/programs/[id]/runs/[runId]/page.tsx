import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import type { ProgramSchema, Node } from "@flowos/schema";
import { getProgramAccess, canView } from "@/lib/workspaces";
import { RunLogLive } from "./run-log-live";
import { StopRunButton } from "./stop-button";
import { SkipTriggerButton } from "./skip-trigger-button";
import { ReplayButton } from "./replay-button";

// ─── Types ────────────────────────────────────────────────────────────────────

type RunRow = {
  id: string;
  program_id: string;
  status: string;
  triggered_by: string;
  trigger_payload: unknown;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  connector_api_calls: number;
  model_call_count: number;
  created_at: string;
};

type NodeExecutionRow = {
  id: string;
  node_id: string;
  status: string;
  input_payload: unknown;
  output_payload: unknown;
  error_message: string | null;
  retry_count: number | null;
  started_at: string | null;
  completed_at: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  connector_api_calls: number;
  model_call_count: number;
  created_at: string;
};

function normalizeRunRow(raw: unknown): RunRow {
  const row = raw as Partial<RunRow>;
  return {
    id: row.id ?? "",
    program_id: row.program_id ?? "",
    status: row.status ?? "pending",
    triggered_by: row.triggered_by ?? "manual",
    trigger_payload: row.trigger_payload ?? null,
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
    error_message: row.error_message ?? null,
    prompt_tokens: Number(row.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? 0),
    total_tokens: Number(row.total_tokens ?? 0),
    estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
    connector_api_calls: Number(row.connector_api_calls ?? 0),
    model_call_count: Number(row.model_call_count ?? 0),
    created_at: row.created_at ?? new Date(0).toISOString(),
  };
}

function normalizeNodeExecutionRow(raw: unknown): NodeExecutionRow {
  const row = raw as Partial<NodeExecutionRow>;
  return {
    id: row.id ?? "",
    node_id: row.node_id ?? "",
    status: row.status ?? "pending",
    input_payload: row.input_payload ?? null,
    output_payload: row.output_payload ?? null,
    error_message: row.error_message ?? null,
    retry_count: row.retry_count ?? null,
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
    prompt_tokens: Number(row.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? 0),
    total_tokens: Number(row.total_tokens ?? 0),
    estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
    connector_api_calls: Number(row.connector_api_calls ?? 0),
    model_call_count: Number(row.model_call_count ?? 0),
    created_at: row.created_at ?? new Date(0).toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const diff = endMs - startMs;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    running:
      "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 animate-pulse",
    completed: "bg-green-500/15 text-green-700 dark:text-green-400",
    success: "bg-green-500/15 text-green-700 dark:text-green-400",
    failed: "bg-destructive/15 text-destructive",
    waiting_approval:
      "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    skipped: "bg-muted text-muted-foreground",
  };
  const cls =
    classes[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Server component ─────────────────────────────────────────────────────────

export default async function RunLogPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const serviceClient = createServiceClient();

  // Fetch run
  const { data: runRaw, error: runError } = await serviceClient
    .from("runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (runError || !runRaw) notFound();

  const run = normalizeRunRow(runRaw);

  // Verify workspace access
  const access = await getProgramAccess(run.program_id, user.id);
  if (!access || !canView(access)) notFound();

  const { data: program, error: progError } = await supabase
    .from("programs")
    .select("id, name, schema")
    .eq("id", run.program_id)
    .single();

  if (progError || !program) notFound();

  type ProgramRow = { id: string; name: string; schema: unknown };
  const prog = program as unknown as ProgramRow;
  const schema = prog.schema as unknown as ProgramSchema;
  const nodeMap: Record<string, Node> = {};
  for (const node of schema.nodes) {
    nodeMap[node.id] = node;
  }

  // Fetch initial node_executions
  const { data: execsRaw } = await serviceClient
    .from("node_executions")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  const initialExecs = (execsRaw ?? []).map(normalizeNodeExecutionRow);

  const triggerNode = Object.values(nodeMap).find((n) => n.type === "trigger");
  const triggerExec = triggerNode
    ? initialExecs.find((e) => e.node_id === triggerNode.id)
    : undefined;
  const showSkipTrigger =
    ["running", "pending"].includes(run.status) &&
    !!triggerNode &&
    (!triggerExec || !["completed", "success"].includes(triggerExec.status));

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground mb-1">
          <a
            href={`/programs/${id}`}
            className="hover:underline"
          >
            {prog.name}
          </a>
          {" / "}
          <a
            href={`/programs/${id}/runs`}
            className="hover:underline"
          >
            Runs
          </a>
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Run log</h1>
          {showSkipTrigger && <SkipTriggerButton runId={run.id} />}
          {["running", "waiting_approval", "pending"].includes(run.status) && (
            <StopRunButton runId={run.id} />
          )}
          {["completed", "success", "failed", "cancelled"].includes(run.status) && (
            <ReplayButton runId={run.id} programId={id} />
          )}
        </div>
      </div>

      {/* Run metadata */}
      <div className="rounded-lg border border-border p-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Run ID</span>
          <p className="font-mono text-xs mt-0.5 break-all">{run.id}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Triggered by</span>
          <p className="mt-0.5">{run.triggered_by}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Started</span>
          <p className="mt-0.5">{formatDateTime(run.started_at)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">
            {run.completed_at ? "Completed" : "Duration so far"}
          </span>
          <p className="mt-0.5">
            {run.completed_at
              ? formatDateTime(run.completed_at)
              : "In progress…"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Duration</span>
          <p className="mt-0.5">
            {formatDuration(run.started_at, run.completed_at)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Token usage</span>
          <p className="mt-0.5">
            {formatInteger(run.total_tokens)} total ({formatInteger(run.prompt_tokens)} in / {formatInteger(run.completion_tokens)} out)
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Estimated model cost</span>
          <p className="mt-0.5">{formatUsd(run.estimated_cost_usd)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Model calls</span>
          <p className="mt-0.5">{formatInteger(run.model_call_count)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Connector API calls</span>
          <p className="mt-0.5">{formatInteger(run.connector_api_calls)}</p>
        </div>
        {run.error_message && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Error</span>
            <p className="mt-0.5 text-destructive text-xs font-mono">
              {run.error_message}
            </p>
          </div>
        )}
      </div>

      {/* Live node execution timeline */}
      <RunLogLive
        runId={runId}
        initialExecs={initialExecs}
        nodeMap={nodeMap}
        edges={schema.edges}
        runStatus={run.status}
        startedAt={run.started_at}
      />
    </div>
  );
}
