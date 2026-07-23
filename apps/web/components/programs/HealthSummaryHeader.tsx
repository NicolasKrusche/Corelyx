"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Minus,
  ActivityIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthSummary = {
  activeCount: number;
  totalWorkflows: number;
  overallSuccessRate: number;
  totalCost30d: number;
  errorRate30d: number;
  errorTrend: "improving" | "worsening" | "stable";
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

function TrendIcon({ trend }: { trend: "improving" | "worsening" | "stable" }) {
  if (trend === "improving") {
    return <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />;
  }
  if (trend === "worsening") {
    return <TrendingUp className="h-3.5 w-3.5 text-red-500" />;
  }
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function trendLabel(trend: "improving" | "worsening" | "stable"): string {
  if (trend === "improving") return "Improving";
  if (trend === "worsening") return "Worsening";
  return "Stable";
}

// ---------------------------------------------------------------------------
// Stat Card (inline helper)
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  icon,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card p-5 rounded-lg shadow-sm border border-border",
        className,
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && (
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HealthSummaryHeader({ summary }: { summary: HealthSummary }) {
  const successColor =
    summary.overallSuccessRate >= 80
      ? "text-emerald-500"
      : summary.overallSuccessRate >= 50
        ? "text-amber-500"
        : "text-red-500";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        label="Active Workflows"
        value={String(summary.activeCount)}
        sub={`${summary.totalWorkflows} total`}
        icon={<Activity className="h-5 w-5 text-primary" />}
      />
      <StatCard
        label="Success Rate (30d)"
        value={`${summary.overallSuccessRate}%`}
        sub={`${summary.errorRate30d}% error rate`}
        icon={<CheckCircle2 className={cn("h-5 w-5", successColor)} />}
      />
      <StatCard
        label="Total Cost (30d)"
        value={usd(summary.totalCost30d)}
        icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
      />
      <StatCard
        label="Error Rate Trend"
        value={`${summary.errorRate30d}%`}
        sub={trendLabel(summary.errorTrend)}
        icon={<TrendIcon trend={summary.errorTrend} />}
      />
    </div>
  );
}
