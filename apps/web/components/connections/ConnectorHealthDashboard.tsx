"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldX,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HealthStatus = "healthy" | "warning" | "critical";

export type ConnectorHealthData = {
  connector_name: string;
  status: HealthStatus;
  status_icon: "🟢" | "🟡" | "🔴";
  last_checked_at: string | null;
  error_message: string | null;
  retry_count: number;
  next_retry_at: string | null;
  latency_ms: number | null;
  check_type: string;
};

export type ConnectorHealthSummaryData = {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  needs_attention: string[];
};

type ConnectorHealthReportData = {
  connectors: ConnectorHealthData[];
  summary?: ConnectorHealthSummaryData;
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  needs_attention: string[];
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

function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRetryInfo(
  retryCount: number,
  nextRetryAt: string | null,
): string | null {
  if (retryCount === 0) return null;
  if (nextRetryAt) {
    const nextDate = new Date(nextRetryAt);
    if (nextDate > new Date()) {
      return `Retry #${retryCount} in ${timeAgo(nextRetryAt).replace("ago", "")}`;
    }
  }
  return `Attempted ${retryCount}x`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: HealthStatus }) {
  const Icon: LucideIcon =
    status === "healthy"
      ? CheckCircle2
      : status === "warning"
        ? AlertTriangle
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
        ? "Retrying"
        : "Critical";

  return (
    <Badge variant={variant} className="gap-1">
      <StatusIcon status={status} />
      {label}
    </Badge>
  );
}

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

// ---------------------------------------------------------------------------
// Connector Health Card
// ---------------------------------------------------------------------------

function ConnectorHealthCard({
  connector,
  onCheckNow,
  checking,
}: {
  connector: ConnectorHealthData;
  onCheckNow: (name: string) => void;
  checking: boolean;
}) {
  const retryInfo = formatRetryInfo(connector.retry_count, connector.next_retry_at);

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-5 hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{connector.status_icon}</span>
            <p className="text-sm font-semibold text-foreground truncate">
              {connector.connector_name}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {connector.check_type.replace("_", " ")}
          </p>
        </div>
        <StatusBadge status={connector.status} />
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            Latency
          </p>
          <p className="text-xs font-medium text-foreground mt-0.5">
            {formatLatency(connector.latency_ms)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            Last Check
          </p>
          <p className="text-xs font-medium text-foreground mt-0.5">
            {timeAgo(connector.last_checked_at)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            Retries
          </p>
          <p
            className={cn(
              "text-xs font-medium mt-0.5",
              connector.retry_count > 0 ? "text-amber-500" : "text-foreground",
            )}
          >
            {connector.retry_count === 0 ? "None" : `${connector.retry_count}/5`}
          </p>
        </div>
      </div>

      {/* Error message */}
      {connector.error_message && (
        <div className="bg-destructive/5 border border-destructive/10 rounded-md p-2.5 mb-3">
          <p className="text-xs text-destructive/80 font-mono break-all">
            {connector.error_message}
          </p>
        </div>
      )}

      {/* Retry info */}
      {retryInfo && (
        <div className="flex items-center gap-1.5 mb-3">
          <Clock className="h-3 w-3 text-amber-500" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {retryInfo}
          </p>
        </div>
      )}

      {/* Check Now button */}
      <div className="pt-3 border-t border-border/40">
        <Button
          size="sm"
          variant="outline"
          disabled={checking}
          onClick={() => onCheckNow(connector.connector_name)}
          className="w-full"
        >
          {checking ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
              Checking...
            </>
          ) : (
            <>
              <Zap className="h-3 w-3 mr-1.5" />
              Check Now
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ConnectorHealthDashboard() {
  const [report, setReport] = useState<ConnectorHealthReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/health");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ConnectorHealthReportData;
      setReport(data);
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load health data",
      );
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await fetchHealth();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchHealth]);

  async function handleCheckNow(connectorName: string) {
    setChecking(connectorName);
    try {
      const res = await fetch("/api/connectors/health/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connector_name: connectorName }),
      });
      if (res.ok) {
        // Refresh the report after the check
        await fetchHealth();
      }
    } catch {
      // Silently handle — the UI will show the last known state
    } finally {
      setChecking(null);
    }
  }

  async function handleCheckAll() {
    setCheckingAll(true);
    try {
      const res = await fetch("/api/connectors/health/check", {
        method: "POST",
      });
      if (res.ok) {
        await fetchHealth();
      }
    } catch {
      // Silently handle
    } finally {
      setCheckingAll(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading connector health...
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

  const { connectors } = report;
  const total = report.total ?? connectors.length;
  const healthy = report.healthy ?? 0;
  const warning = report.warning ?? 0;
  const critical = report.critical ?? 0;
  const needsAttention = report.needs_attention ?? [];

  if (connectors.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          No connector health data yet. Run a health check to get started.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          disabled={checkingAll}
          onClick={handleCheckAll}
        >
          {checkingAll ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Checking all connectors...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Check All Connectors
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="flex items-center justify-between gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
          <StatCard
            label="Total Connectors"
            value={String(total)}
            icon={<Activity className="h-5 w-5 text-primary" />}
          />
          <StatCard
            label="Healthy"
            value={String(healthy)}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          />
          <StatCard
            label="Retrying"
            value={String(warning)}
            icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          />
          <StatCard
            label="Critical"
            value={String(critical)}
            icon={<ShieldX className="h-5 w-5 text-red-500" />}
          />
        </div>
        <Button
          variant="outline"
          disabled={checkingAll}
          onClick={handleCheckAll}
          className="shrink-0"
        >
          {checkingAll ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Check All
            </>
          )}
        </Button>
      </div>

      {/* Needs attention banner */}
      {needsAttention.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
            Needs Attention
          </p>
          <p className="text-xs text-amber-600/80 dark:text-amber-400/70">
            {needsAttention.join(", ")}
          </p>
        </div>
      )}

      {/* Connector cards grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {connectors.map((connector) => (
          <ConnectorHealthCard
            key={connector.connector_name}
            connector={connector}
            onCheckNow={handleCheckNow}
            checking={checking === connector.connector_name}
          />
        ))}
      </div>
    </div>
  );
}
