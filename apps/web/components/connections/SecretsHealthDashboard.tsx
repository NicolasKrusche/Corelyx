"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Key,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HealthStatus = "healthy" | "warning" | "critical";

export type ConnectionHealthData = {
  connectionId: string;
  name: string;
  provider: string;
  authType: string;
  status: HealthStatus;
  statusIcon: "🟢" | "🟡" | "🔴";
  expiresAt: string | null;
  lastValidatedAt: string | null;
  createdAt: string;
  isValid: boolean;
  rotationDueAt: string | null;
  daysUntilRotation: number | null;
  currentScopes: string[];
  expectedScopes: string[] | null;
  scopeDrift: boolean;
  issues: {
    severity: "info" | "warning" | "critical";
    type: string;
    message: string;
  }[];
};

export type SecretsHealthSummaryData = {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  needsAttention: string[];
};

type SecretsHealthReportData = {
  connections: ConnectionHealthData[];
  summary: SecretsHealthSummaryData;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function daysUntil(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: HealthStatus }) {
  const Icon: LucideIcon =
    status === "healthy"
      ? ShieldCheck
      : status === "warning"
        ? ShieldAlert
        : ShieldX;

  const color =
    status === "healthy"
      ? "text-emerald-500"
      : status === "warning"
        ? "text-amber-500"
        : "text-red-500";

  return <Icon className={cn("h-5 w-5", color)} />;
}

function StatusBadge({ status }: { status: HealthStatus }) {
  const variant =
    status === "healthy"
      ? "success"
      : status === "warning"
        ? "warning"
        : "destructive";

  const label =
    status === "healthy"
      ? "Healthy"
      : status === "warning"
        ? "Warning"
        : "Critical";

  return (
    <Badge variant={variant} className="gap-1">
      <StatusIcon status={status} />
      {label}
    </Badge>
  );
}

function IssueList({
  issues,
}: {
  issues: ConnectionHealthData["issues"];
}) {
  if (issues.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No issues detected.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {issues.map((issue, i) => (
        <li
          key={`${issue.type}-${i}`}
          className={cn(
            "flex items-start gap-1.5 text-xs",
            issue.severity === "critical"
              ? "text-red-500"
              : issue.severity === "warning"
                ? "text-amber-500"
                : "text-muted-foreground",
          )}
        >
          {issue.severity === "critical" ? (
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          ) : issue.severity === "warning" ? (
            <Clock className="h-3 w-3 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
          )}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

// ─── Stat Card (inline helper) ────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: string;
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
    </div>
  );
}

// ─── Connection Health Card ────────────────────────────────────────────────

function ConnectionHealthCard({
  connection,
}: {
  connection: ConnectionHealthData;
}) {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-5 hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">
            {connection.name}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {connection.provider} · {connection.authType}
          </p>
        </div>
        <StatusBadge status={connection.status} />
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            Expires
          </p>
          <p
            className={cn(
              "text-xs font-medium mt-0.5",
              connection.expiresAt
                ? new Date(connection.expiresAt).getTime() < Date.now()
                  ? "text-red-500"
                  : new Date(connection.expiresAt).getTime() <
                      Date.now() + 7 * 24 * 60 * 60 * 1000
                    ? "text-amber-500"
                    : "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {connection.expiresAt ? daysUntil(connection.expiresAt) : "N/A"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            Rotation
          </p>
          <p
            className={cn(
              "text-xs font-medium mt-0.5",
              connection.daysUntilRotation !== null
                ? connection.daysUntilRotation < 0
                  ? "text-red-500"
                  : connection.daysUntilRotation <= 14
                    ? "text-amber-500"
                    : "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {connection.daysUntilRotation !== null
              ? daysUntil(connection.rotationDueAt)
              : "N/A"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            Validated
          </p>
          <p className="text-xs font-medium text-foreground mt-0.5">
            {timeAgo(connection.lastValidatedAt)}
          </p>
        </div>
      </div>

      {/* Issues */}
      <div className="pt-3 border-t border-border/40">
        <IssueList issues={connection.issues} />
      </div>

      {/* Scope drift badge */}
      {connection.scopeDrift && (
        <div className="mt-2">
          <Badge variant="warning" className="gap-1">
            <Key className="h-3 w-3" />
            Scope drift detected
          </Badge>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SecretsHealthDashboard() {
  const [report, setReport] = useState<SecretsHealthReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const res = await fetch("/api/connections/health");
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as SecretsHealthReportData;
        if (!cancelled) {
          setReport(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load health data",
          );
          setLoading(false);
        }
      }
    }

    fetchHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">
          Checking connection health…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!report) return null;

  const { connections, summary } = report;

  if (connections.length === 0) {
    return (
      <div className="text-center py-12">
        <Key className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          No connections found. Connect a service to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Connections"
          value={String(summary.total)}
          icon={<Key className="h-5 w-5 text-primary" />}
        />
        <StatCard
          label="Healthy"
          value={String(summary.healthy)}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        />
        <StatCard
          label="Warnings"
          value={String(summary.warning)}
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
        />
        <StatCard
          label="Critical"
          value={String(summary.critical)}
          icon={<ShieldX className="h-5 w-5 text-red-500" />}
        />
      </div>

      {/* Needs attention banner */}
      {summary.needsAttention.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
            Needs Attention
          </p>
          <p className="text-xs text-amber-600/80 dark:text-amber-400/70">
            {summary.needsAttention.join(", ")}
          </p>
        </div>
      )}

      {/* Connection cards grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {connections.map((conn) => (
          <ConnectionHealthCard key={conn.connectionId} connection={conn} />
        ))}
      </div>
    </div>
  );
}
