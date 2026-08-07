"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Edge, Node } from "@flowos/schema";
import { RunGraphFlow } from "./run-graph-flow";
import { AiGeneratedContentNotice } from "@/components/ai-transparency";
import { TimelineScrubber } from "@/components/runs/TimelineScrubber";
import { formatUsdAsCredits } from "@/lib/credit-packs";
import { formatTimeOnly } from "@/lib/format-datetime";

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
  billed_cost_usd: number;
  connector_api_calls: number;
  model_call_count: number;
  created_at: string;
};

/**
 * Exactly the columns NodeExecutionRow carries. `select("*")` shipped
 * `estimated_cost_usd` — the raw provider cost, i.e. the platform margin — to
 * the browser on every poll; `billed_cost_usd` is the only cost a user may see.
 */
const EXEC_COLUMNS =
  "id, node_id, status, input_payload, output_payload, error_message, retry_count, started_at, completed_at, prompt_tokens, completion_tokens, total_tokens, billed_cost_usd, connector_api_calls, model_call_count, created_at";

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
  return new Intl.NumberFormat("en-US").format(value);
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
    billed_cost_usd: Number(row.billed_cost_usd ?? 0),
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

const ACTIONABLE_ERRORS: Array<{
  test: (msg: string) => boolean;
  title: string;
  detail: string;
  cta: string;
  href: string;
}> = [
  {
    test: (m) => /permission.?denied|read.?only access|write permission/i.test(m) && /reconnect/i.test(m),
    title: "Connection needs write access",
    detail: "Your Google Sheets connection was set up with read-only permissions. You need to reconnect it so the app can write to your spreadsheet.",
    cta: "Reconnect Google Sheets →",
    href: "/connections",
  },
  {
    test: (m) => /token is expired|could not be refreshed|please reconnect your/i.test(m),
    title: "Connection expired",
    detail: "Your OAuth token has expired and could not be refreshed automatically. Reconnect the connection to get a fresh token.",
    cta: "Go to Connections →",
    href: "/connections",
  },
  {
    test: (m) => /connection.*not found/i.test(m),
    title: "Connection not found",
    detail: "The connection referenced by this node no longer exists or hasn't been linked to this program.",
    cta: "Manage Connections →",
    href: "/connections",
  },
  {
    test: (m) => /api key not found|api key.*invalid|invalid.*api key/i.test(m),
    title: "API key missing or invalid",
    detail: "The API key used by this node is missing or has been revoked. Add a valid key in API Keys settings.",
    cta: "Go to API Keys →",
    href: "/api-keys",
  },
];

function ErrorBlock({ message }: { message: string }) {
  const copyToClipboard = () => navigator.clipboard?.writeText(message).catch(() => {});
  const codeMatch = message.match(/^\[([A-Z_]+)\]\s*/);
  const code = codeMatch?.[1];
  const body = codeMatch ? message.slice(codeMatch[0].length) : message;
  const action = ACTIONABLE_ERRORS.find((a) => a.test(message));

  return (
    <div className="mt-2 space-y-2">
      {action && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
            ⚠ {action.title}
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
            {action.detail}
          </p>
          <Link
            href={action.href}
            className="inline-flex items-center text-xs font-medium text-amber-900 dark:text-amber-300 underline underline-offset-2 hover:opacity-80"
          >
            {action.cta}
          </Link>
        </div>
      )}
      <div className="rounded border border-destructive/40 bg-destructive/5 p-3 space-y-1">
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
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const POLL_INTERVAL_MS = 2000;

export function RunLogLive({
  runId,
  initialExecs,
  nodeMap,
  edges,
  runStatus: initialRunStatus,
  startedAt,
}: {
  runId: string;
  initialExecs: NodeExecutionRow[];
  nodeMap: Record<string, Node>;
  edges: Edge[];
  runStatus: string;
  startedAt?: string | null;
}) {
  const router = useRouter();
  const [execs, setExecs] = useState<NodeExecutionRow[]>(initialExecs);
  const [runStatus, setRunStatus] = useState(initialRunStatus);
  const [elapsed, setElapsed] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Seeded from the run's state at mount: starting at `false` made an already
  // finished run look like it had just turned terminal, so every page load of a
  // finished run fired a router.refresh().
  const prevTerminalRef = useRef(TERMINAL.has(initialRunStatus));
  const supabase = createBrowserClient();
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  const isTerminal = TERMINAL.has(runStatus);

  // Refresh server component once run reaches terminal so metadata reflects final values
  useEffect(() => {
    if (isTerminal && !prevTerminalRef.current) {
      router.refresh();
    }
    prevTerminalRef.current = isTerminal;
  }, [isTerminal, router]);

  // Live elapsed timer while run is active
  useEffect(() => {
    if (isTerminal || !startedAt) {
      setElapsed("");
      return;
    }
    const tick = () => setElapsed(formatDuration(startedAt, null));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isTerminal, startedAt]);

  // Merge incoming exec rows (insert or update)
  const mergeExec = (updated: NodeExecutionRow) =>
    setExecs((prev) => {
      const idx = prev.findIndex((e) => e.id === updated.id);
      if (idx === -1) {
        return [...prev, updated].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
      const next = [...prev];
      next[idx] = updated;
      return next;
    });

  const fetchExecs = async () => {
    const { data } = await supabase
      .from("node_executions")
      .select(EXEC_COLUMNS)
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    if (data && data.length > 0) setExecs(data.map(normalizeNodeExecutionRow));
  };

  const fetchRunStatus = async () => {
    const { data } = await supabase
      .from("runs")
      .select("status")
      .eq("id", runId)
      .single();
    const row = data as { status?: string } | null;
    if (row?.status) setRunStatus(row.status);
  };

  // Idempotent: both the terminal-status effect and unmount call this, and
  // whichever runs first leaves the refs empty for the other.
  const stopLiveUpdates = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  useEffect(() => {
    fetchExecs();
    fetchRunStatus();

    if (isTerminal) return;

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
    channelRef.current = channel;

    pollRef.current = setInterval(async () => {
      await fetchExecs();
      await fetchRunStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      stopLiveUpdates();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Stop polling once terminal. This effect, not the one above, is what tears
  // the subscription down mid-session: that one is keyed on runId alone, so it
  // does not re-run when a live run finishes and its channel stayed open.
  useEffect(() => {
    if (!isTerminal) return;
    stopLiveUpdates();
    fetchExecs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTerminal]);

  // Determine whether to show the timeline scrubber:
  // terminal run with more than 1 node execution
  const showScrubber = isTerminal && execs.length > 1;

  return (
    <div className="space-y-6">
      {/* ── Run overview — same React Flow graph as the editor ────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-medium">Run overview</h2>
          <StatusBadge status={runStatus} />
          {!isTerminal && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-600 dark:text-yellow-400">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
              Live
            </span>
          )}
          {!isTerminal && elapsed && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {elapsed}
            </span>
          )}
        </div>

        <RunGraphFlow nodeMap={nodeMap} edges={edges} execs={execs} highlightedNodeId={highlightedNodeId} />
      </section>

      {/* ── Timeline Scrubber (only when terminal + multiple execs) ──── */}
      {showScrubber && (
        <TimelineScrubber
          execs={execs}
          nodeMap={nodeMap}
          highlightedNodeId={highlightedNodeId}
          onHighlight={setHighlightedNodeId}
        />
      )}

      {/* ── Node executions detail ─────────────────────────────────────────── */}
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
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={exec.status} />
                      <span className="text-sm font-medium">{label}</span>
                      {node && (
                        <span className="text-xs text-muted-foreground">({node.type})</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 text-right">
                      {exec.started_at
                        ? `${formatTimeOnly(exec.started_at)} · ${duration}`
                        : "—"}
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground font-mono">
                    node: {exec.node_id}
                  </p>

                  {exec.retry_count != null && exec.retry_count > 0 && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      ⟳ Retried {exec.retry_count} time{exec.retry_count !== 1 ? "s" : ""}
                    </p>
                  )}

                  {(exec.billed_cost_usd > 0 || exec.connector_api_calls > 0 || exec.model_call_count > 0) && (
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                      {exec.billed_cost_usd > 0 && (
                        <span>credits: {formatUsdAsCredits(exec.billed_cost_usd)}</span>
                      )}
                      {exec.model_call_count > 0 && (
                        <span>model calls: {formatInteger(exec.model_call_count)}</span>
                      )}
                      {exec.connector_api_calls > 0 && (
                        <span>connector API calls: {formatInteger(exec.connector_api_calls)}</span>
                      )}
                    </div>
                  )}

                  {exec.error_message && <ErrorBlock message={exec.error_message} />}

                  <JsonViewer label="▸ Input" data={exec.input_payload} defaultOpen={isFailed} />
                  <JsonViewer label="▸ Output" data={exec.output_payload} />
                  {(node?.type === "agent" || node?.type === "agent_task") &&
                    exec.output_payload != null && (
                      <AiGeneratedContentNotice contentKind="output" className="italic" />
                    )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
