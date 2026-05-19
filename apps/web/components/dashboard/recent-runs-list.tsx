"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

type RecentRun = {
  id: string;
  program_id: string;
  status: string;
  triggered_by: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  programs: { name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  running: "bg-yellow-400",
  completed: "bg-green-500",
  success: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-muted-foreground",
  waiting_approval: "bg-blue-400",
  pending: "bg-muted-foreground",
};

const STATUS_BG: Record<string, string> = {
  running: "bg-yellow-400/10 text-yellow-500",
  completed: "bg-green-500/10 text-green-600",
  success: "bg-green-500/10 text-green-600",
  failed: "bg-red-500/10 text-red-500",
  cancelled: "bg-muted/60 text-muted-foreground",
  waiting_approval: "bg-blue-400/10 text-blue-500",
  pending: "bg-muted/60 text-muted-foreground",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function duration(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const INITIAL_VISIBLE = 5;

export function RecentRunsList({
  runs,
  searchQuery,
}: {
  runs: RecentRun[];
  searchQuery: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRuns = expanded ? runs : runs.slice(0, INITIAL_VISIBLE);
  const hiddenCount = runs.length - INITIAL_VISIBLE;

  if (runs.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-xs text-muted-foreground">
          {searchQuery ? "No runs match your search." : "No runs yet."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-border/40">
        {visibleRuns.map((run) => {
          const d = duration(run.started_at, run.completed_at);
          return (
            <Link
              key={run.id}
              href={`/programs/${run.program_id}/runs/${run.id}`}
              className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/30"
            >
              <div className="mt-0.5 shrink-0">
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold capitalize ${STATUS_BG[run.status] ?? "bg-muted/60 text-muted-foreground"}`}>
                  <span className={`h-1 w-1 rounded-full ${STATUS_COLORS[run.status] ?? "bg-muted-foreground"}`} />
                  {run.status === "completed" ? "OK" : run.status === "waiting_approval" ? "Waiting" : run.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{run.programs?.name ?? "Unknown"}</p>
                <p className="font-mono text-[10px] text-muted-foreground/60">{run.triggered_by}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-[10px] text-muted-foreground/70">{timeAgo(run.created_at)}</p>
                {d && <p className="font-mono text-[10px] text-muted-foreground/40">{d}</p>}
              </div>
            </Link>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <div className="border-t border-border/40">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full px-4 py-2.5 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors text-left"
          >
            {expanded ? "Show less" : `Show ${hiddenCount} more run${hiddenCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/40 px-4 py-2.5">
        <p className="text-[10px] text-muted-foreground/50">
          {runs.filter((r) => r.status === "failed").length > 0 && (
            <span className="text-red-500">{runs.filter((r) => r.status === "failed").length} failed</span>
          )}
          {runs.filter((r) => r.status === "failed").length > 0 && runs.filter((r) => ["completed", "success"].includes(r.status)).length > 0 && " · "}
          {runs.filter((r) => ["completed", "success"].includes(r.status)).length > 0 && (
            <span>{runs.filter((r) => ["completed", "success"].includes(r.status)).length} ok</span>
          )}
        </p>
        <button className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors">
          <RefreshCw className="h-2.5 w-2.5" />
          Refresh
        </button>
      </div>
    </>
  );
}
