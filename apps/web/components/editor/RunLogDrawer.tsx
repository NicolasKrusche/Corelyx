"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Node as SchemaNode } from "@flowos/schema";
import type { NodeExecutionData } from "./EditorShell";
import { PanelResizeHandle } from "@/components/editor/PanelResizeHandle";
import { AiGeneratedContentNotice } from "@/components/ai-transparency";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  // Clamp to 0: server-issued timestamps can be slightly ahead of the client
  // clock, which would otherwise render a nonsensical negative duration.
  const d = Math.max(0, e - s);
  if (d < 1000) return `${d}ms`;
  if (d < 60_000) return `${(d / 1000).toFixed(1)}s`;
  return `${Math.floor(d / 60_000)}m ${Math.floor((d % 60_000) / 1000)}s`;
}

function fmt(n: number) {
  return new Intl.NumberFormat().format(n);
}

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 4, maximumFractionDigits: 6,
  }).format(n);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:          "bg-muted text-muted-foreground",
    idle:             "bg-muted text-muted-foreground",
    running:          "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 animate-pulse",
    completed:        "bg-green-500/15 text-green-700 dark:text-green-400",
    success:          "bg-green-500/15 text-green-700 dark:text-green-400",
    failed:           "bg-destructive/15 text-destructive",
    cancelled:        "bg-muted text-muted-foreground",
    waiting_approval: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    skipped:          "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? map.pending}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── JSON viewer ──────────────────────────────────────────────────────────────

function JsonViewer({ label, data }: { label: string; data: unknown }) {
  if (data == null) return null;
  return (
    <details className="mt-1">
      <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none">
        {label}
      </summary>
      <pre className="mt-1 p-2 rounded bg-muted/60 text-[11px] overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

// ─── Actionable error banner ──────────────────────────────────────────────────

const ACTIONABLE: Array<{ test: (m: string) => boolean; title: string; detail: string; cta: string; href: string }> = [
  {
    test: (m) => /permission.?denied|read.?only access|write permission/i.test(m) && /reconnect/i.test(m),
    title: "Connection needs write access",
    detail: "Your Google Sheets connection was set up with read-only permissions. Reconnect it to grant write access.",
    cta: "Reconnect →",
    href: "/connections",
  },
  {
    test: (m) => /token is expired|could not be refreshed|please reconnect your/i.test(m),
    title: "Connection expired",
    detail: "Your OAuth token has expired. Reconnect to get a fresh token.",
    cta: "Go to Connections →",
    href: "/connections",
  },
  {
    test: (m) => /connection.*not found/i.test(m),
    title: "Connection not found",
    detail: "The connection no longer exists or isn't linked to this program.",
    cta: "Manage Connections →",
    href: "/connections",
  },
  {
    test: (m) => /api key not found|api key.*invalid|invalid.*api key/i.test(m),
    title: "API key missing or invalid",
    detail: "The API key used by this node is missing or revoked.",
    cta: "Go to API Keys →",
    href: "/api-keys",
  },
];

function ErrorBlock({ message }: { message: string }) {
  const copy = () => navigator.clipboard?.writeText(message).catch(() => {});
  const codeMatch = message.match(/^\[([A-Z_]+)\]\s*/);
  const code = codeMatch?.[1];
  // The run log is a debugging surface — show the actual error verbatim rather
  // than the sanitized friendly text. Fall back only when there is no message.
  const body =
    (codeMatch ? message.slice(codeMatch[0].length) : message).trim() ||
    "This step could not finish. Check the setup and try again.";
  const action = ACTIONABLE.find((a) => a.test(message));

  return (
    <div className="space-y-1.5 mt-1.5">
      {action && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 px-3 py-2 space-y-1">
          <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-300">⚠ {action.title}</p>
          <p className="text-[11px] text-amber-800 dark:text-amber-400 leading-snug">{action.detail}</p>
          <Link href={action.href} className="text-[11px] font-medium text-amber-900 dark:text-amber-300 underline underline-offset-2 hover:opacity-80">
            {action.cta}
          </Link>
        </div>
      )}
      <div className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2">
        <div className="flex items-start justify-between gap-2 mb-1">
          {code && (
            <span className="font-mono text-[10px] font-semibold bg-destructive/15 text-destructive px-1.5 py-0.5 rounded">
              {code}
            </span>
          )}
          <button onClick={copy} className="ml-auto shrink-0 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5">
            Copy details
          </button>
        </div>
        <p className="text-[11px] text-destructive whitespace-pre-wrap break-words leading-relaxed">
          {body}
        </p>
      </div>
    </div>
  );
}

// Shown while a node is still running but a prior attempt recorded an error.
// This is a transient retry state — not a terminal failure — so it must not
// use the alarming "could not finish" failure styling.
function RetryingNote({ message }: { message: string }) {
  const copy = () => navigator.clipboard?.writeText(message).catch(() => {});
  const codeMatch = message.match(/^\[([A-Z_]+)\]\s*/);
  const code = codeMatch?.[1];
  // Surface the real error from the failed attempt, not a generic placeholder.
  const detail =
    (codeMatch ? message.slice(codeMatch[0].length) : message).trim() ||
    "A previous attempt failed — retrying.";
  return (
    <div className="rounded border border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2 mt-1.5 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-amber-900 dark:text-amber-300">
          ⟳ Retrying after an error{code ? <span className="font-mono"> · {code}</span> : null}
        </span>
        <button onClick={copy} className="ml-auto shrink-0 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5">
          Copy details
        </button>
      </div>
      <p className="text-[11px] text-amber-800 dark:text-amber-400 whitespace-pre-wrap break-words leading-relaxed">
        {detail}
      </p>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RunLogDrawerProps {
  runId: string;
  programId: string;
  runStatus: string;
  startedAt: string | null;
  schemaNodes: SchemaNode[];
  nodeExecutions: Record<string, NodeExecutionData>;
  onClose: () => void;
}

// Covers runtime values ("completed", "cancelled") and schema-defined terminal
// states ("success", "partial") so the Live badge and elapsed timer stop reliably.
const TERMINAL = new Set(["completed", "success", "partial", "failed", "cancelled"]);
const VISUAL_NODE_TYPES = new Set(["note", "group"]);

// ─── RunLogDrawer ─────────────────────────────────────────────────────────────

export function RunLogDrawer({
  runId,
  programId,
  runStatus,
  startedAt,
  schemaNodes,
  nodeExecutions,
  onClose,
}: RunLogDrawerProps) {
  const isTerminal = TERMINAL.has(runStatus);
  const [elapsed, setElapsed] = useState("");

  // Live elapsed timer
  useEffect(() => {
    if (isTerminal || !startedAt) { setElapsed(""); return; }
    const tick = () => setElapsed(formatDuration(startedAt, null));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isTerminal, startedAt]);

  // Build ordered list: nodes that have execution data first (by created_at),
  // then remaining schema nodes
  const nodeMap = Object.fromEntries(schemaNodes.map((n) => [n.id, n]));

  const executedEntries = Object.entries(nodeExecutions)
    .filter(([nodeId]) => {
      const node = nodeMap[nodeId];
      return !node || !VISUAL_NODE_TYPES.has(node.type);
    })
    .sort((a, b) => {
      const ta = a[1].created_at ? new Date(a[1].created_at).getTime() : 0;
      const tb = b[1].created_at ? new Date(b[1].created_at).getTime() : 0;
      return ta - tb;
    });

  // Height toggle
  const [expanded, setExpanded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll to bottom as new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [executedEntries.length]);

  return (
    <div
      className={[
        "absolute bottom-0 left-0 right-0 z-40",
        "flex flex-col",
        "border-t border-border bg-background/95 backdrop-blur-sm shadow-lg",
        "transition-[height] duration-200",
        expanded ? "h-[55vh]" : "h-[260px]",
      ].join(" ")}
    >
      <PanelResizeHandle edge="top" />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={expanded ? "Collapse" : "Expand"}
        >
          <svg className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M4 10l4-4 4 4" />
          </svg>
        </button>

        <span className="text-xs font-semibold text-foreground">Run log</span>

        <StatusBadge status={runStatus} />

        {!isTerminal && (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-600 dark:text-yellow-400">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
            Live
          </span>
        )}

        {elapsed && (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {elapsed}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          <Link
            href={`/programs/${programId}/runs/${runId}`}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Full log ↗
          </Link>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            title="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Execution list ─────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {executedEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {isTerminal ? "No node executions recorded." : "Waiting for execution to start…"}
          </p>
        ) : (
          executedEntries.map(([nodeId, exec]) => {
            const node = nodeMap[nodeId];
            const label = node?.label ?? nodeId;
            const isFailed = exec.status === "failed";
            const duration = formatDuration(exec.started_at, exec.completed_at);

            return (
              <div
                key={nodeId}
                className={`rounded-lg border px-3 py-2.5 space-y-1.5 text-xs ${isFailed ? "border-destructive/50" : "border-border"}`}
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={exec.status} />
                    <span className="font-medium">{label}</span>
                    {node && <span className="text-muted-foreground">({node.type})</span>}
                  </div>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {exec.started_at
                      ? `${new Date(exec.started_at).toLocaleTimeString()} · ${duration}`
                      : "—"}
                  </span>
                </div>

                {/* Metrics */}
                {(exec.total_tokens > 0 || exec.connector_api_calls > 0) && (
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                    {exec.total_tokens > 0 && (
                      <span>tokens: {fmt(exec.total_tokens)} ({fmt(exec.prompt_tokens)} / {fmt(exec.completion_tokens)})</span>
                    )}
                    {exec.connector_api_calls > 0 && (
                      <span>API calls: {fmt(exec.connector_api_calls)}</span>
                    )}
                    {exec.estimated_cost_usd > 0 && (
                      <span>cost: {fmtUsd(exec.estimated_cost_usd)}</span>
                    )}
                  </div>
                )}

                {/* Retry */}
                {exec.retry_count != null && exec.retry_count > 0 && (
                  <p className="text-[11px] text-yellow-600 dark:text-yellow-400">
                    ⟳ Retried {exec.retry_count}×
                  </p>
                )}

                {/* Error — only a terminal failure shows the hard error block.
                    A still-running node with a recorded error is mid-retry. */}
                {exec.error_message && (
                  exec.status === "running"
                    ? <RetryingNote message={exec.error_message} />
                    : <ErrorBlock message={exec.error_message} />
                )}

                {/* I/O */}
                <JsonViewer label="▸ Input"  data={exec.input_payload} />
                <JsonViewer label="▸ Output" data={exec.output_payload} />

                {/* AI transparency disclaimer — shown on every AI-produced output */}
                {(node?.type === "agent" || node?.type === "agent_task") &&
                  exec.output_payload != null && (
                    <AiGeneratedContentNotice contentKind="output" className="italic" />
                  )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
