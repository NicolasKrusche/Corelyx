"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  InteractiveLogsTable,
  type Log,
  type LogLevel,
} from "@/components/ui/interactive-logs-table-shadcnui";
import { readClientLogs, subscribeToClientLogs, type ClientLogRow } from "@/lib/client-logs";

type NodeExecution = {
  id: string;
  node_id: string;
  status: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_tokens: number;
  billed_cost_usd: number;
  created_at: string;
};

type RunRow = {
  id: string;
  program_id: string;
  status: string;
  triggered_by: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  total_tokens: number;
  billed_cost_usd: number;
  created_at: string;
  programs: { name: string | null } | null;
  node_executions: NodeExecution[] | null;
};

type AppLogRow = {
  id: string;
  user_id: string;
  program_id: string | null;
  run_id: string | null;
  level: LogLevel;
  source: string;
  event: string;
  status: string;
  message: string;
  details: unknown;
  duration_ms: number | null;
  created_at: string;
};

function clientLogToAppLog(row: ClientLogRow): AppLogRow {
  return {
    id: `client:${row.id}`,
    user_id: "client",
    program_id: row.program_id,
    run_id: row.run_id,
    level: row.level,
    source: row.source,
    event: row.event,
    status: row.status,
    message: row.message,
    details: row.details,
    duration_ms: row.duration_ms,
    created_at: row.created_at,
  };
}

function runLevel(status: string): LogLevel {
  if (status === "failed") return "error";
  if (status === "cancelled" || status === "paused") return "warning";
  return "info";
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const diff = endMs - startMs;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
}

function formatDurationMs(durationMs: number | null): string {
  if (durationMs == null) return "—";
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;
}

function runToLog(run: RunRow): Log {
  const programName = run.programs?.name ?? "unknown program";
  const message =
    run.error_message ??
    `Run ${run.id.slice(0, 8)} · triggered by ${run.triggered_by}`;

  const tags: string[] = [`trigger:${run.triggered_by}`];
  const nodeCount = run.node_executions?.length ?? 0;
  if (nodeCount > 0) tags.push(`${nodeCount} node${nodeCount === 1 ? "" : "s"}`);
  if (run.total_tokens > 0) tags.push(`${run.total_tokens.toLocaleString()} tok`);
  if (run.billed_cost_usd > 0) tags.push(`$${run.billed_cost_usd.toFixed(4)}`);

  return {
    id: run.id,
    timestamp: run.created_at,
    level: runLevel(run.status),
    service: programName,
    message,
    duration: formatDuration(run.started_at, run.completed_at),
    status: run.status,
    tags,
    detail: run.error_message,
    href: `/programs/${run.program_id}/runs/${run.id}`,
  };
}

function appLogToLog(row: AppLogRow): Log {
  const tags = [row.event];
  if (row.program_id) tags.push("program");
  if (row.run_id) tags.push("run");

  return {
    id: `app:${row.id}`,
    timestamp: row.created_at,
    level: row.level,
    service: row.source,
    message: row.message,
    duration: formatDurationMs(row.duration_ms),
    status: row.status,
    tags,
    detail: typeof row.details === "string" ? row.details : JSON.stringify(row.details, null, 2),
    href: row.program_id ? `/programs/${row.program_id}` : null,
  };
}

const NODE_STATUS_STYLES: Record<string, string> = {
  pending:          "bg-muted/60 text-muted-foreground",
  queued:           "bg-muted/60 text-muted-foreground",
  running:          "bg-yellow-500/12 text-yellow-400",
  completed:        "bg-green-500/12 text-green-400",
  failed:           "bg-red-500/12 text-red-400",
  skipped:          "bg-muted/60 text-muted-foreground",
  waiting_approval: "bg-blue-500/12 text-blue-400",
};

function RunDetail({ run }: { run: RunRow }) {
  const executions = [...(run.node_executions ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Triggered by
          </p>
          <p className="font-mono text-foreground">{run.triggered_by}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Duration
          </p>
          <p className="font-mono text-foreground">
            {formatDuration(run.started_at, run.completed_at)}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cost
          </p>
          <p className="font-mono text-foreground">
            {run.billed_cost_usd > 0
              ? `$${run.billed_cost_usd.toFixed(4)}`
              : "—"}{" "}
            <span className="text-muted-foreground">
              {run.total_tokens > 0
                ? `· ${run.total_tokens.toLocaleString()} tok`
                : ""}
            </span>
          </p>
        </div>
      </div>

      {run.error_message && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Error
          </p>
          <p className="rounded bg-background p-3 font-mono text-xs text-red-400 whitespace-pre-wrap break-words border border-red-500/20">
            {run.error_message}
          </p>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Node executions ({executions.length})
        </p>
        {executions.length === 0 ? (
          <p className="rounded bg-background p-3 text-xs text-muted-foreground border border-border">
            No node executions recorded yet.
          </p>
        ) : (
          <div className="rounded-md border border-border bg-background divide-y divide-border/60 overflow-hidden">
            {executions.map((exec) => {
              const badgeCls =
                NODE_STATUS_STYLES[exec.status] ??
                "bg-muted/60 text-muted-foreground";
              return (
                <div
                  key={exec.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold font-mono shrink-0 capitalize ${badgeCls}`}
                  >
                    {exec.status.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-xs text-foreground truncate flex-1">
                    {exec.node_id}
                  </span>
                  {exec.error_message && (
                    <span className="font-mono text-[11px] text-red-400 truncate max-w-[40%]">
                      {exec.error_message}
                    </span>
                  )}
                  {exec.total_tokens > 0 && (
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                      {exec.total_tokens.toLocaleString()} tok
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-16 text-right">
                    {formatDuration(exec.started_at, exec.completed_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Link
        href={`/programs/${run.program_id}/runs/${run.id}`}
        className="inline-flex items-center text-xs font-semibold text-primary hover:underline"
      >
        Open run →
      </Link>
    </div>
  );
}

function AppLogDetail({ row }: { row: AppLogRow }) {
  const detailText = row.details
    ? typeof row.details === "string"
      ? row.details
      : JSON.stringify(row.details, null, 2)
    : "No additional details recorded.";

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Source
          </p>
          <p className="font-mono text-foreground">{row.source}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Event
          </p>
          <p className="font-mono text-foreground">{row.event}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </p>
          <p className="font-mono text-foreground">{row.status}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Duration
          </p>
          <p className="font-mono text-foreground">{formatDurationMs(row.duration_ms)}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Message
        </p>
        <p className="rounded bg-background p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words border border-border">
          {row.message}
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Details
        </p>
        <pre className="rounded bg-background p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words border border-border">
          {detailText}
        </pre>
      </div>

      <div className="flex gap-3">
        {row.program_id && (
          <Link
            href={`/programs/${row.program_id}`}
            className="inline-flex items-center text-xs font-semibold text-primary hover:underline"
          >
            Open program â†’
          </Link>
        )}
        {row.program_id && row.run_id && (
          <Link
            href={`/programs/${row.program_id}/runs/${row.run_id}`}
            className="inline-flex items-center text-xs font-semibold text-primary hover:underline"
          >
            Open run â†’
          </Link>
        )}
      </div>
    </div>
  );
}

export function LogsClient() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [appLogs, setAppLogs] = useState<AppLogRow[]>([]);
  const [clientLogs, setClientLogs] = useState<AppLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refresh = () => setClientLogs(readClientLogs().map(clientLogToAppLog));
    refresh();
    return subscribeToClientLogs(refresh);
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("runs")
        .select(
          `
          id, program_id, status, triggered_by, started_at, completed_at,
          error_message, total_tokens, billed_cost_usd, created_at,
          programs!inner(name),
          node_executions(id, node_id, status, error_message, started_at, completed_at, total_tokens, billed_cost_usd, created_at)
          `
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (!cancelled && !error && data) {
        setRuns(data as unknown as RunRow[]);
      }

      const { data: logData, error: logError } = await supabase
        .from("app_logs")
        .select(
          `
          id, user_id, program_id, run_id, level, source, event, status,
          message, details, duration_ms, created_at
          `
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (!cancelled && !logError && logData) {
        setAppLogs(logData as unknown as AppLogRow[]);
      }
      if (!cancelled && logError) {
        setClientLogs((current) => [
          {
            id: "client:app-logs-table-unavailable",
            user_id: "client",
            program_id: null,
            run_id: null,
            level: "warning",
            source: "Logs",
            event: "logs.app_logs_unavailable",
            status: "warning",
            message: "Database app logs are not available yet. Apply the app_logs migration for persistent server logs.",
            details: { code: logError.code, message: logError.message },
            duration_ms: null,
            created_at: new Date().toISOString(),
          },
          ...current.filter((row) => row.id !== "client:app-logs-table-unavailable"),
        ]);
      }
      if (!cancelled) setLoading(false);
    }

    void load();

    // Debounce so a burst of realtime events (e.g. many node_executions completing
    // at once) coalesces into a single reload instead of many back-to-back fetches.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleLoad() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void load(); }, 400);
    }

    const supabaseChannels = [
      supabase
        .channel("logs-runs")
        .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, scheduleLoad)
        .subscribe(),
      supabase
        .channel("logs-node-executions")
        .on("postgres_changes", { event: "*", schema: "public", table: "node_executions" }, scheduleLoad)
        .subscribe(),
      supabase
        .channel("logs-app-logs")
        .on("postgres_changes", { event: "*", schema: "public", table: "app_logs" }, scheduleLoad)
        .subscribe(),
    ];

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabaseChannels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, []);

  const runsById = useMemo(() => {
    const map = new Map<string, RunRow>();
    for (const r of runs) map.set(r.id, r);
    return map;
  }, [runs]);

  const appLogsByLogId = useMemo(() => {
    const map = new Map<string, AppLogRow>();
    for (const row of [...appLogs, ...clientLogs]) map.set(`app:${row.id}`, row);
    return map;
  }, [appLogs, clientLogs]);

  const logs = useMemo(
    () =>
      [...runs.map(runToLog), ...appLogs.map(appLogToLog), ...clientLogs.map(appLogToLog)].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [runs, appLogs, clientLogs]
  );

  return (
    <div className="h-[calc(100vh-6rem)]">
      <InteractiveLogsTable
        logs={logs}
        title="Logs"
        subtitle={
          loading
            ? "Loading…"
            : `${logs.length} recent log${logs.length === 1 ? "" : "s"}`
        }
        emptyMessage={
          loading
            ? "Loading runs…"
            : "No logs yet. Generate or trigger a program to see activity here."
        }
        renderDetail={(log) => {
          const appLog = appLogsByLogId.get(log.id);
          if (appLog) return <AppLogDetail row={appLog} />;

          const run = runsById.get(log.id);
          if (!run) return null;
          return <RunDetail run={run} />;
        }}
      />
    </div>
  );
}

