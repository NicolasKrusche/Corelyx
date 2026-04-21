"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import Plan, { type PlanStatus, type PlanTask } from "@/components/ui/agent-plan";
import type { Edge, Node } from "@flowos/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 animate-pulse",
    completed: "bg-green-500/15 text-green-700 dark:text-green-400",
    success: "bg-green-500/15 text-green-700 dark:text-green-400",
    failed: "bg-destructive/15 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
    waiting_approval: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    skipped: "bg-muted text-muted-foreground",
  };
  const cls = classes[status] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── JSON collapsible viewer ──────────────────────────────────────────────────

function JsonViewer({ label, data, defaultOpen = false }: { label: string; data: unknown; defaultOpen?: boolean }) {
  if (data == null) return null;
  const text = JSON.stringify(data, null, 2);
  return (
    <details className="mt-1" open={defaultOpen}>
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
        {label}
      </summary>
      <pre className="mt-1 p-2 rounded bg-muted text-xs overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
        {text}
      </pre>
    </details>
  );
}

// ─── Error detail block ───────────────────────────────────────────────────────

function ErrorBlock({ message }: { message: string }) {
  const copyToClipboard = () => navigator.clipboard?.writeText(message).catch(() => {});
  // Parse out a code prefix like [OAUTH_TOKEN_FAILED] if present
  const codeMatch = message.match(/^\[([A-Z_]+)\]\s*/);
  const code = codeMatch?.[1];
  const body = codeMatch ? message.slice(codeMatch[0].length) : message;

  return (
    <div className="mt-2 rounded border border-destructive/40 bg-destructive/5 p-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {code && (
            <span className="font-mono text-[10px] font-semibold bg-destructive/15 text-destructive px-1.5 py-0.5 rounded">
              {code}
            </span>
          )}
        </div>
        <button
          onClick={copyToClipboard}
          className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5"
        >
          Copy
        </button>
      </div>
      <pre className="text-xs text-destructive font-mono whitespace-pre-wrap break-all leading-relaxed">
        {body}
      </pre>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const POLL_INTERVAL_MS = 2000;

function toPlanStatus(status: string | null | undefined): PlanStatus {
  if (status === "completed" || status === "success") return "completed";
  if (status === "running") return "in-progress";
  if (status === "waiting_approval") return "need-help";
  if (status === "failed" || status === "cancelled") return "failed";
  if (status === "skipped") return "skipped";
  return "pending";
}

function getNodeTools(node: Node): string[] {
  if (node.type === "agent") {
    const model =
      node.config.model && node.config.model !== "__USER_ASSIGNED__"
        ? node.config.model
        : "model";
    return [model, ...node.config.tools].filter(Boolean);
  }

  if (node.type === "connection") {
    if ("connector_type" in node.config && node.config.connector_type === "http") {
      return ["http", node.config.method].filter(Boolean);
    }
    return [
      node.config.provider ?? node.connection ?? "oauth",
      node.config.operation ?? "token",
    ].filter(Boolean);
  }

  if (node.type === "step") {
    return [node.config.logic_type];
  }

  return [node.config.trigger_type];
}

function getPriority(node: Node, status: string | null | undefined) {
  if (status === "failed" || status === "waiting_approval") return "high";
  if (node.type === "agent" || node.type === "connection") return "high";
  if (node.type === "trigger") return "medium";
  return "low";
}

function summarizeNode(node: Node) {
  if (node.description) return node.description;
  if (node.type === "agent") return "Run an agent step in this program.";
  if (node.type === "connection") return "Call a connected service.";
  if (node.type === "step") return `Apply ${node.config.logic_type} logic.`;
  return `Handle the ${node.config.trigger_type} trigger.`;
}

function buildPlanTasks({
  nodeMap,
  edges,
  execs,
  runStatus,
}: {
  nodeMap: Record<string, Node>;
  edges: Edge[];
  execs: NodeExecutionRow[];
  runStatus: string;
}): PlanTask[] {
  const execByNode = new Map(execs.map((exec) => [exec.node_id, exec]));
  const nodeIdsWithIncoming = new Set(edges.map((edge) => edge.to));

  return Object.values(nodeMap).map((node) => {
    const exec = execByNode.get(node.id);
    const inferredStatus =
      exec?.status ??
      (TERMINAL.has(runStatus) && !exec ? "skipped" : node.status);
    const taskStatus = toPlanStatus(inferredStatus);
    const dependencies = edges
      .filter((edge) => edge.to === node.id)
      .map((edge) => nodeMap[edge.from]?.label ?? edge.from);
    const tools = getNodeTools(node);
    const priority = getPriority(node, inferredStatus);

    return {
      id: node.id,
      title: node.label,
      description: summarizeNode(node),
      status: taskStatus,
      priority,
      level: nodeIdsWithIncoming.has(node.id) ? 1 : 0,
      dependencies,
      subtasks: [
        {
          id: `${node.id}-input`,
          title: "Receive input",
          description: exec?.input_payload
            ? "Runtime captured input for this node."
            : "Waiting for upstream data or trigger payload.",
          status: exec?.started_at ? "completed" : taskStatus,
          priority,
        },
        {
          id: `${node.id}-execute`,
          title: `Execute ${node.type}`,
          description: summarizeNode(node),
          status: taskStatus,
          priority,
          tools,
        },
        {
          id: `${node.id}-output`,
          title: "Publish output",
          description: exec?.output_payload
            ? "Runtime captured output for downstream nodes."
            : "Output will appear after this node completes.",
          status: exec?.output_payload
            ? "completed"
            : taskStatus === "failed"
              ? "failed"
              : "pending",
          priority,
        },
      ],
    };
  });
}

export function RunLogLive({
  runId,
  initialExecs,
  nodeMap,
  edges,
  runStatus: initialRunStatus,
}: {
  runId: string;
  initialExecs: NodeExecutionRow[];
  nodeMap: Record<string, Node>;
  edges: Edge[];
  runStatus: string;
}) {
  const [execs, setExecs] = useState<NodeExecutionRow[]>(initialExecs);
  const [runStatus, setRunStatus] = useState(initialRunStatus);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createBrowserClient();

  const isTerminal = TERMINAL.has(runStatus);
  const planTasks = useMemo(
    () => buildPlanTasks({ nodeMap, edges, execs, runStatus }),
    [edges, execs, nodeMap, runStatus]
  );

  // Merge incoming exec rows (insert or update)
  const mergeExec = (updated: NodeExecutionRow) =>
    setExecs((prev) => {
      const idx = prev.findIndex((e) => e.id === updated.id);
      if (idx === -1) return [...prev, updated].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const next = [...prev];
      next[idx] = updated;
      return next;
    });

  // Fetch all current node_executions from Supabase
  const fetchExecs = async () => {
    const { data } = await supabase
      .from("node_executions")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    if (data && data.length > 0) setExecs(data.map(normalizeNodeExecutionRow));
  };

  // Fetch current run status
  const fetchRunStatus = async () => {
    const { data } = await supabase
      .from("runs")
      .select("status")
      .eq("id", runId)
      .single();
    const row = data as { status?: string } | null;
    if (row?.status) setRunStatus(row.status);
  };

  useEffect(() => {
    // Always do an immediate fetch in case the page loaded before runtime wrote rows
    fetchExecs();
    fetchRunStatus();

    if (isTerminal) return;

    // ── Realtime subscriptions ─────────────────────────────────────────────
    const channel = supabase
      .channel(`run-log-${runId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "node_executions", filter: `run_id=eq.${runId}` },
        (payload) => mergeExec(normalizeNodeExecutionRow(payload.new))
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "runs", filter: `id=eq.${runId}` },
        (payload) => {
          const updated = payload.new as { status: string };
          setRunStatus(updated.status);
        }
      )
      .subscribe();

    // ── Polling fallback (in case Realtime isn't enabled on the table) ─────
    pollRef.current = setInterval(async () => {
      await fetchExecs();
      await fetchRunStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Stop polling once terminal
  useEffect(() => {
    if (isTerminal && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      // Final fetch to make sure we have the complete picture
      fetchExecs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTerminal]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-medium">Run overview</h2>
          <StatusBadge status={runStatus} />
        </div>
        <Plan
          tasks={planTasks}
          interactive={false}
          className="p-0"
          emptyMessage="No plan steps available for this run."
        />
      </section>

      <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-medium">Node executions</h2>
        <StatusBadge status={runStatus} />
      </div>

      {execs.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {isTerminal ? "No node executions recorded." : "Waiting for execution to start…"}
        </div>
      ) : (
        <div className="space-y-2">
          {execs.map((exec) => {
            const node = nodeMap[exec.node_id];
            const label = node?.label ?? exec.node_id;
            const duration = formatDuration(exec.started_at, exec.completed_at);
            const isFailed = exec.status === "failed";

            return (
              <div
                key={exec.id}
                className={`rounded-lg border p-4 space-y-2 ${isFailed ? "border-destructive/50" : "border-border"}`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={exec.status} />
                    <span className="text-sm font-medium">{label}</span>
                    {node && (
                      <span className="text-xs text-muted-foreground">
                        ({node.type})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 text-right">
                    {exec.started_at
                      ? `${new Date(exec.started_at).toLocaleTimeString()} · ${duration}`
                      : "—"}
                  </div>
                </div>

                {/* Node ID (always visible for debugging) */}
                <p className="text-[10px] text-muted-foreground font-mono">
                  node: {exec.node_id}
                </p>

                {/* Retry info */}
                {exec.retry_count != null && exec.retry_count > 0 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    ⟳ Retried {exec.retry_count} time{exec.retry_count !== 1 ? "s" : ""}
                  </p>
                )}

                {/* Error — full detail, never truncated */}
                {(exec.total_tokens > 0 || exec.connector_api_calls > 0 || exec.model_call_count > 0) && (
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    {exec.total_tokens > 0 && (
                      <span>
                        tokens: {formatInteger(exec.total_tokens)} ({formatInteger(exec.prompt_tokens)} in / {formatInteger(exec.completion_tokens)} out)
                      </span>
                    )}
                    {exec.model_call_count > 0 && (
                      <span>model calls: {formatInteger(exec.model_call_count)}</span>
                    )}
                    {exec.connector_api_calls > 0 && (
                      <span>connector API calls: {formatInteger(exec.connector_api_calls)}</span>
                    )}
                    {exec.estimated_cost_usd > 0 && (
                      <span>estimated cost: {formatUsd(exec.estimated_cost_usd)}</span>
                    )}
                  </div>
                )}

                {exec.error_message && <ErrorBlock message={exec.error_message} />}

                {/* Input / Output — open by default when failed so context is immediate */}
                <JsonViewer label="▸ Input" data={exec.input_payload} defaultOpen={isFailed} />
                <JsonViewer label="▸ Output" data={exec.output_payload} />
              </div>
            );
          })}
        </div>
      )}
      </section>
    </div>
  );
}
