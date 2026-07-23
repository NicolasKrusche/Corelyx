"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

type NodeMap = Record<string, { id: string; label: string; type: string }>;

interface TimelineScrubberProps {
  execs: NodeExecutionRow[];
  nodeMap: NodeMap;
  highlightedNodeId: string | null;
  onHighlight: (nodeId: string | null) => void;
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

function statusColor(status: string): string {
  switch (status) {
    case "completed":
    case "success":
      return "bg-green-500 text-white";
    case "failed":
      return "bg-red-500 text-white";
    case "running":
      return "bg-yellow-500 text-white animate-pulse";
    case "pending":
      return "bg-muted text-muted-foreground";
    case "skipped":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function previewJson(data: unknown, maxLen = 120): string {
  if (data == null) return "—";
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TimelineScrubber({
  execs,
  nodeMap,
  highlightedNodeId,
  onHighlight,
}: TimelineScrubberProps) {
  // Sort execs chronologically by started_at
  const sortedSteps = useMemo(() => {
    return [...execs]
      .filter((e) => e.started_at != null)
      .sort(
        (a, b) =>
          new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime()
      );
  }, [execs]);

  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= sortedSteps.length) return;
    setActiveIndex(idx);
    onHighlight(sortedSteps[idx].node_id);
  };

  const prev = () => goTo(activeIndex - 1);
  const next = () => goTo(activeIndex + 1);
  const clear = () => {
    setActiveIndex(-1);
    onHighlight(null);
  };

  const activeExec = activeIndex >= 0 ? sortedSteps[activeIndex] : null;
  const activeNode = activeExec ? nodeMap[activeExec.node_id] : null;

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-3">
      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">
          Step-through playback
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={activeIndex <= 0}
            onClick={prev}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous step"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={activeIndex < 0 || activeIndex >= sortedSteps.length - 1}
            onClick={next}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next step"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {activeIndex >= 0 && (
            <button
              type="button"
              onClick={clear}
              className="ml-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Stepper dots ────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {sortedSteps.map((exec, idx) => {
          const node = nodeMap[exec.node_id];
          const isActive = idx === activeIndex;
          return (
            <button
              key={exec.id}
              type="button"
              onClick={() => goTo(idx)}
              title={`${node?.label ?? exec.node_id} — ${exec.status}`}
              className={`shrink-0 h-5 min-w-[20px] rounded-full border-2 transition-all duration-150 cursor-pointer ${
                isActive
                  ? "border-blue-500 bg-blue-500 scale-110"
                  : `border-transparent ${statusColor(exec.status)}`
              }`}
            />
          );
        })}
      </div>

      {/* ── Step counter ────────────────────────────────────────────── */}
      <div className="text-[11px] text-muted-foreground">
        {activeIndex >= 0
          ? `Step ${activeIndex + 1} of ${sortedSteps.length}`
          : `${sortedSteps.length} step${sortedSteps.length !== 1 ? "s" : ""} — click a dot or use arrows to begin`}
      </div>

      {/* ── Info panel for active step ──────────────────────────────── */}
      {activeExec && (
        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">
              {activeNode?.label ?? activeExec.node_id}
            </span>
            {activeNode && (
              <span className="text-muted-foreground">({activeNode.type})</span>
            )}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor(activeExec.status)}`}
            >
              {activeExec.status.replace(/_/g, " ")}
            </span>
            <span className="text-muted-foreground ml-auto">
              {formatDuration(activeExec.started_at, activeExec.completed_at)}
            </span>
          </div>

          <div className="space-y-1">
            <div>
              <span className="text-muted-foreground">Input: </span>
              <span className="font-mono text-[10px] text-foreground break-all">
                {previewJson(activeExec.input_payload)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Output: </span>
              <span className="font-mono text-[10px] text-foreground break-all">
                {previewJson(activeExec.output_payload)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
