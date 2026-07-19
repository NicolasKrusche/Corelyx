"use client";

import { useState } from "react";
import Link from "next/link";
import { StopRunButton } from "@/app/(app)/programs/[id]/runs/[runId]/stop-button";

type RunRow = {
  id: string;
  program_id: string;
  status: string;
  triggered_by: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  programs: { name: string } | null;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function calcDurationMs(start: string | null, end: string | null): number | null {
  if (!start) return null;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, e - s);
}

function formatDurationStr(start: string | null, end: string | null): string {
  const ms = calcDurationMs(start, end);
  if (ms === null) return "—";
  return formatDuration(ms);
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit", hour12: true });
}

const STATUS_STYLES: Record<string, string> = {
  pending:          "bg-muted/60 text-muted-foreground",
  running:          "bg-yellow-500/12 text-yellow-400",
  completed:        "bg-green-500/12 text-green-500",
  success:          "bg-green-500/12 text-green-500",
  failed:           "bg-red-500/12 text-red-400",
  cancelled:        "bg-muted/60 text-muted-foreground",
  waiting_approval: "bg-blue-500/12 text-blue-400",
};

const STATUS_DOT: Record<string, string> = {
  running:          "bg-yellow-400",
  completed:        "bg-green-500",
  success:          "bg-green-500",
  failed:           "bg-red-500",
  waiting_approval: "bg-blue-400",
};

const ACTIVE_STATUSES = ["running", "waiting_approval", "pending"];

function StatusBadge({ status }: { status: string }) {
  const label =
    status === "completed" ? "OK" :
    status === "success"   ? "OK" :
    status === "waiting_approval" ? "Waiting" :
    status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold font-mono capitalize shrink-0 ${STATUS_STYLES[status] ?? "bg-muted/60 text-muted-foreground"}`}>
      {STATUS_DOT[status] && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />}
      {label}
    </span>
  );
}

const INITIAL_VISIBLE = 15;

export function ExpandableRunList({ runs }: { runs: RunRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRuns = expanded ? runs : runs.slice(0, INITIAL_VISIBLE);
  const hiddenCount = runs.length - INITIAL_VISIBLE;

  return (
    <div className="rounded-xl border glass-card divide-y divide-border/60 overflow-hidden">
      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[90px_1fr_130px_100px_80px_24px] gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 border-b border-border/60">
        <span>Status</span>
        <span>Program / Message</span>
        <span>When</span>
        <span>Trigger</span>
        <span className="text-right">Duration</span>
        <span />
      </div>

      {visibleRuns.map((run) => (
        <div key={run.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors">
          <Link
            href={`/programs/${run.program_id}/runs/${run.id}`}
            className="grid sm:grid-cols-[90px_1fr_130px_100px_80px_24px] gap-3 items-center min-w-0 flex-1"
          >
            <StatusBadge status={run.status} />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {run.programs?.name ?? "Unknown program"}
              </p>
              <p className="text-[11px] text-muted-foreground/50 font-mono truncate">
                {run.triggered_by}
                {run.error_message && (
                  <span className="text-red-400/80 ml-1">
                    — {run.error_message.slice(0, 70)}{run.error_message.length > 70 ? "…" : ""}
                  </span>
                )}
              </p>
            </div>
            <span className="hidden sm:block text-[11px] text-muted-foreground/50 font-mono">
              {formatWhen(run.started_at ?? run.created_at)}
            </span>
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/50">
              {run.triggered_by === "cron" ? (
                <><svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 text-muted-foreground/30"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1ZM8 5a.75.75 0 0 0-.75.75v2.5c0 .28.16.537.415.657l2 1a.75.75 0 0 0 .67-1.344L8.75 7.9V5.75A.75.75 0 0 0 8 5Z"/></svg> schedule</>
              ) : (
                <><svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 text-muted-foreground/30"><path d="M2 2.75C2 1.784 2.784 1 3.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 10h-.5a.75.75 0 0 0 0 1.5h.5A3.25 3.25 0 0 0 15.5 8.25v-5.5A3.25 3.25 0 0 0 12.25 0h-8.5A3.25 3.25 0 0 0 .5 3.25v5.5A3.25 3.25 0 0 0 3.75 12h.5a.75.75 0 0 0 0-1.5h-.5C3.093 10.5 2.5 9.907 2.5 9.25v-.5H8a.75.75 0 0 0 0-1.5H2.5V2.75Z"/></svg> {run.triggered_by?.split(":")[0] || "manual"}</>
              )}
            </span>
            <span className="hidden sm:block text-right font-mono text-[11px] text-muted-foreground/50 tabular-nums">
              {formatDurationStr(run.started_at, run.completed_at)}
            </span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="hidden sm:block w-3 h-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors shrink-0">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
          {ACTIVE_STATUSES.includes(run.status) && (
            <StopRunButton runId={run.id} />
          )}
        </div>
      ))}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-3 text-xs text-muted-foreground/60 hover:text-foreground hover:bg-accent/20 transition-colors text-left border-t border-border/60"
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more run${hiddenCount !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
