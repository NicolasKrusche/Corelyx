"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProgramSchema } from "@flowos/schema";
import type { NodeExecutionData } from "./EditorShell";
import { PanelResizeHandle } from "@/components/editor/PanelResizeHandle";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebugPanelProps {
  schema: ProgramSchema;
  nodeExecutions: Record<string, NodeExecutionData>;
  lastRunId: string | null;
  onClose: () => void;
  /** Navigate the canvas to the selected node */
  onFocusNode?: (nodeId: string) => void;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | undefined }) {
  const colorMap: Record<string, string> = {
    success: "bg-green-500/15 text-green-400",
    failed: "bg-red-500/15 text-red-400",
    running: "bg-blue-500/15 text-blue-400 animate-pulse",
    waiting_approval: "bg-amber-500/15 text-amber-400",
    skipped: "bg-zinc-500/15 text-zinc-400",
    idle: "bg-zinc-500/10 text-zinc-500",
  };
  const label = status ?? "idle";
  return (
    <span className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", colorMap[label] ?? colorMap.idle)}>
      {label.replace("_", " ")}
    </span>
  );
}

// ─── Duration helper ──────────────────────────────────────────────────────────

function formatDuration(started: string | null, completed: string | null): string | null {
  if (!started || !completed) return null;
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── JSON viewer ──────────────────────────────────────────────────────────────

function JsonViewer({ value, label }: { value: unknown; label: string }) {
  const [open, setOpen] = useState(false);
  if (value === null || value === undefined) return null;
  const str = JSON.stringify(value, null, 2);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={cn("h-2.5 w-2.5 transition-transform", open && "rotate-90")}
        >
          <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      {open && (
        <pre className="mt-1 text-[10px] leading-relaxed bg-zinc-900/60 dark:bg-zinc-950/60 rounded p-2 overflow-x-auto text-zinc-300 max-h-40">
          {str}
        </pre>
      )}
    </div>
  );
}

// ─── DebugPanel ────────────────────────────────────────────────────────────────

export function DebugPanel({ schema, nodeExecutions, lastRunId, onClose, onFocusNode }: DebugPanelProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Only show execution nodes (exclude note/group)
  const execNodes = schema.nodes.filter((n) => n.type !== "note" && n.type !== "group");
  const selectedExec = selectedNodeId ? nodeExecutions[selectedNodeId] : null;
  const selectedNode = selectedNodeId ? execNodes.find((n) => n.id === selectedNodeId) : null;

  const hasAnyRun = Object.keys(nodeExecutions).length > 0;

  return (
    <aside
      className={cn(
        "fixed right-0 bottom-0 z-20 w-80",
        "bg-background border-l border-border shadow-xl",
        "flex flex-col overflow-hidden",
      )}
      style={{ top: 56 }}
    >
      <PanelResizeHandle edge="left" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Step debugger</span>
          {lastRunId && (
            <span className="text-[10px] text-muted-foreground font-mono">
              #{lastRunId.slice(0, 8)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close debugger"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!hasAnyRun ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-xs text-muted-foreground text-center">
            No run data yet. Run this program to inspect step-by-step execution.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Node list */}
          <div className="w-36 shrink-0 border-r border-border overflow-y-auto py-1">
            {execNodes.map((node) => {
              const exec = nodeExecutions[node.id];
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    onFocusNode?.(node.id);
                  }}
                  className={cn(
                    "w-full text-left px-2.5 py-2 flex flex-col gap-0.5 border-b border-border/50",
                    "hover:bg-accent transition-colors",
                    selectedNodeId === node.id && "bg-accent",
                  )}
                >
                  <span className="text-[11px] font-medium text-foreground truncate leading-tight">
                    {node.label}
                  </span>
                  <StatusBadge status={exec?.status} />
                </button>
              );
            })}
          </div>

          {/* Detail pane */}
          <div className="flex-1 overflow-y-auto p-3">
            {!selectedNode ? (
              <p className="text-[11px] text-muted-foreground">Select a node to inspect its inputs and outputs.</p>
            ) : selectedExec ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold truncate">{selectedNode.label}</p>
                  <StatusBadge status={selectedExec.status} />
                </div>

                {/* Timing */}
                {(() => {
                  const dur = formatDuration(selectedExec.started_at, selectedExec.completed_at);
                  return dur ? (
                    <p className="text-[10px] text-muted-foreground">
                      Duration: <span className="font-mono">{dur}</span>
                    </p>
                  ) : null;
                })()}

                {/* Error */}
                {selectedExec.error_message && (
                  <div className="rounded bg-red-500/10 border border-red-500/20 px-2 py-1.5">
                    <p className="text-[10px] font-medium text-red-400 mb-0.5">Error</p>
                    <p className="text-[10px] text-red-300 leading-relaxed">{selectedExec.error_message}</p>
                  </div>
                )}

                {/* Input / Output */}
                <JsonViewer value={selectedExec.input_payload} label="Input payload" />
                <JsonViewer value={selectedExec.output_payload} label="Output payload" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold">{selectedNode.label}</p>
                <p className="text-[11px] text-muted-foreground">This node was not reached in the last run.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
