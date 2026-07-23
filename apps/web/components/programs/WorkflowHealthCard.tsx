"use client";

import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  PauseCircle,
  Play,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowHealthData = {
  id: string;
  name: string;
  execution_mode: string;
  is_active: boolean;
  last_run_at: string | null;
  recentRuns: { status: string; started_at: string }[];
  totalRuns30d: number;
  completedRuns30d: number;
  failedRuns30d: number;
  successRate: number;
  estimatedCost30d: number;
  healthStatus: "healthy" | "degraded" | "error" | "inactive";
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_COLORS: Record<string, { bar: string; dot: string }> = {
  completed: {
    bar: "bg-emerald-500",
    dot: "bg-emerald-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]",
  },
  failed: {
    bar: "bg-red-500",
    dot: "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]",
  },
  running: {
    bar: "bg-blue-500",
    dot: "bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.6)]",
  },
  pending: {
    bar: "bg-muted-foreground/30",
    dot: "bg-muted-foreground/30",
  },
  cancelled: {
    bar: "bg-amber-500",
    dot: "bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.6)]",
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HealthBar({ recentRuns }: { recentRuns: { status: string }[] }) {
  // Show last 10 runs as a horizontal segmented bar
  const bars = recentRuns.length > 0 ? recentRuns.slice(0, 10) : [];
  const emptySlots = Math.max(0, 10 - bars.length);

  return (
    <div className="flex items-center gap-0.5" title={`Last ${bars.length} runs`}>
      {bars.map((run, i) => {
        const colors = STATUS_COLORS[run.status] ?? STATUS_COLORS.pending;
        return (
          <div
            key={i}
            className={cn(
              "h-3 w-3 rounded-sm transition-colors",
              colors.bar,
            )}
            title={run.status}
          />
        );
      })}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="h-3 w-3 rounded-sm bg-muted/40"
          title="No run"
        />
      ))}
    </div>
  );
}

function HealthBadge({ status }: { status: WorkflowHealthData["healthStatus"] }) {
  const variant =
    status === "healthy"
      ? "success"
      : status === "degraded"
        ? "warning"
        : status === "error"
          ? "destructive"
          : "secondary";

  const Icon =
    status === "healthy"
      ? CheckCircle2
      : status === "error"
        ? AlertCircle
        : status === "inactive"
          ? PauseCircle
          : AlertCircle;

  const label =
    status === "healthy"
      ? "Healthy"
      : status === "degraded"
        ? "Degraded"
        : status === "error"
          ? "Error"
          : "Inactive";

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function WorkflowHealthCard({ workflow }: { workflow: WorkflowHealthData }) {
  return (
    <div className="group bg-card rounded-lg shadow-sm border border-border p-5 hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/programs/${workflow.id}`}
            className="text-sm font-semibold text-foreground hover:underline truncate block"
          >
            {workflow.name}
          </Link>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {workflow.execution_mode}
          </p>
        </div>
        <HealthBadge status={workflow.healthStatus} />
      </div>

      {/* Health bar (last 10 runs) */}
      <div className="mb-3">
        <p className="text-[10px] text-muted-foreground/60 mb-1.5 uppercase tracking-wider font-medium">
          Last 10 runs
        </p>
        <HealthBar recentRuns={workflow.recentRuns} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            Success
          </p>
          <p
            className={cn(
              "text-sm font-bold mt-0.5",
              workflow.successRate >= 80
                ? "text-emerald-500"
                : workflow.successRate >= 50
                  ? "text-amber-500"
                  : "text-red-500",
            )}
          >
            {workflow.successRate}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            Last Run
          </p>
          <p className="text-sm font-medium text-foreground mt-0.5 flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {timeAgo(workflow.last_run_at)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            Cost (30d)
          </p>
          <p className="text-sm font-medium text-foreground mt-0.5 flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            {usd(workflow.estimatedCost30d)}
          </p>
        </div>
      </div>

      {/* Runs count + quick actions */}
      <div className="flex items-center justify-between pt-3 border-t border-border/40">
        <p className="text-[11px] text-muted-foreground">
          {workflow.totalRuns30d} runs · {workflow.completedRuns30d} ok ·{" "}
          {workflow.failedRuns30d} failed
        </p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link
            href={`/programs/${workflow.id}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="View program"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={`/programs/${workflow.id}?tab=runs`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="View runs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={`/programs/${workflow.id}?action=run`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Run now"
          >
            <Play className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
