"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Filter,
  Heart,
  RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HealthSummaryHeader,
  type HealthSummary,
} from "@/components/programs/HealthSummaryHeader";
import {
  WorkflowHealthCard,
  type WorkflowHealthData,
} from "@/components/programs/WorkflowHealthCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterTab = "all" | "healthy" | "degraded" | "error" | "inactive";

type HealthDashboardData = {
  workflows: WorkflowHealthData[];
  summary: HealthSummary & {
    totalWorkflows: number;
    needsAttention: string[];
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkflowHealthPage() {
  const [data, setData] = useState<HealthDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/programs/health");
      if (!res.ok) {
        throw new Error(`Failed to load health data (${res.status})`);
      }
      const json: HealthDashboardData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Filter counts
  const counts = {
    all: data?.workflows.length ?? 0,
    healthy: data?.workflows.filter((w) => w.healthStatus === "healthy").length ?? 0,
    degraded: data?.workflows.filter((w) => w.healthStatus === "degraded").length ?? 0,
    error: data?.workflows.filter((w) => w.healthStatus === "error").length ?? 0,
    inactive: data?.workflows.filter((w) => w.healthStatus === "inactive").length ?? 0,
  };

  // Apply filter
  const visible =
    data?.workflows.filter((w) => {
      if (activeFilter === "all") return true;
      return w.healthStatus === activeFilter;
    }) ?? [];

  const needsAttention = data?.summary.needsAttention ?? [];

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground mb-1">
          <Link href="/programs" className="hover:underline">
            Programs
          </Link>
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
            Workflow Health
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <Heart className="h-3 w-3" />
            Command Center
          </span>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCcw className="h-5 w-5 animate-spin mr-2" />
          Loading health data…
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Failed to load health data
            </p>
            <p className="text-xs text-red-500/70 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="ml-auto shrink-0 rounded-md bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/20 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary header + content */}
      {data && !loading && (
        <>
          <HealthSummaryHeader summary={data.summary} />

          {/* Alert banner for workflows needing attention */}
          {needsAttention.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  {needsAttention.length} workflow{needsAttention.length > 1 ? "s" : ""} need attention
                </p>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-0.5">
                  {needsAttention.join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex items-center gap-2 border-b border-border/40 px-1 py-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {([
                ["all", "All"],
                ["healthy", "Healthy"],
                ["degraded", "Degraded"],
                ["error", "Error"],
                ["inactive", "Inactive"],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveFilter(tab)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs transition-colors",
                    activeFilter === tab
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {label} {counts[tab]}
                </button>
              ))}
            </div>
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => void fetchData()}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                <RefreshCcw className={cn("h-3 w-3", loading && "animate-spin")} />
                Refresh
              </button>
            </div>
          </div>

          {/* Workflow health cards grid */}
          {visible.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((w) => (
                <WorkflowHealthCard key={w.id} workflow={w} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {activeFilter === "all"
                  ? "No workflows found in this workspace"
                  : `No ${activeFilter} workflows`}
              </p>
              <p className="text-xs mt-1 text-muted-foreground/60">
                {activeFilter === "all"
                  ? "Create a program to get started"
                  : "Try a different filter"}
              </p>
            </div>
          )}

          {/* Back link */}
          <div className="pt-2">
            <Link
              href="/programs"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to programs
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
