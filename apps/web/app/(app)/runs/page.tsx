import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { StopRunButton } from "@/app/(app)/programs/[id]/runs/[runId]/stop-button";
import { getTranslations } from "next-intl/server";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; group?: string }>;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("runs");
  const resolvedSearchParams = await searchParams;

  const activeWorkspace = await getActiveWorkspace(user.id);

  // Fetch programs by workspace (not user_id)
  let programIds: string[] = [];
  if (activeWorkspace) {
    const { data: programsRaw } = await supabase
      .from("programs")
      .select("id")
      .eq("workspace_id", activeWorkspace.workspaceId);
    programIds = (programsRaw ?? []).map((p: { id: string }) => p.id);
  }

  const serviceClient = createServiceClient();

  let query = serviceClient
    .from("runs")
    .select("id, program_id, status, triggered_by, started_at, completed_at, error_message, created_at, programs(name)")
    .in("program_id", programIds.length > 0 ? programIds : ["__none__"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (resolvedSearchParams.status) {
    query = query.eq("status", resolvedSearchParams.status);
  }

  const { data: runsRaw } = await query;
  const runs = (runsRaw ?? []) as unknown as RunRow[];

  // ── Stats ─────────────────────────────────────────────────────────────────
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const runs24h = runs.filter((r) => new Date(r.created_at).getTime() >= dayAgo);

  const activeStatuses = ["running", "waiting_approval"];
  const active = runs.filter((r) => activeStatuses.includes(r.status));
  const completed = runs.filter((r) => !activeStatuses.includes(r.status));

  const okRuns = runs24h.filter((r) => ["completed", "success"].includes(r.status));
  const failedRuns24h = runs24h.filter((r) => r.status === "failed");
  const cancelledRuns24h = runs24h.filter((r) => r.status === "cancelled");
  const runningNow = active.length;

  const successRate = runs24h.length > 0 ? Math.round((okRuns.length / runs24h.length) * 100) : null;

  const durations = runs24h
    .filter((r) => r.started_at && r.completed_at)
    .map((r) => calcDurationMs(r.started_at, r.completed_at)!)
    .sort((a, b) => a - b);
  const p50ms = percentile(durations, 0.5);
  const p95ms = percentile(durations, 0.95);

  // ── Bar chart buckets (36 × 40-min = 24h) ────────────────────────────────
  const BUCKET_COUNT = 36;
  const BUCKET_MS = 40 * 60 * 1000;
  const buckets = Array.from({ length: BUCKET_COUNT }, (_, i) => {
    const bucketEnd = now - (BUCKET_COUNT - 1 - i) * BUCKET_MS;
    const bucketStart = bucketEnd - BUCKET_MS;
    const br = runs.filter((r) => {
      const t2 = new Date(r.created_at).getTime();
      return t2 >= bucketStart && t2 < bucketEnd;
    });
    return {
      ok: br.filter((r) => ["completed", "success"].includes(r.status)).length,
      failed: br.filter((r) => r.status === "failed").length,
      cancelled: br.filter((r) => r.status === "cancelled").length,
      running: br.filter((r) => r.status === "running").length,
    };
  });
  const maxBucket = Math.max(...buckets.map((b) => b.ok + b.failed + b.cancelled + b.running), 1);

  // ── Grouped error fingerprints ─────────────────────────────────────────────
  const groupByError = resolvedSearchParams.group === "error";
  type ErrorGroup = { fingerprint: string; count: number; runs: RunRow[]; connector: string };
  const errorGroupMap = new Map<string, ErrorGroup>();
  if (groupByError) {
    for (const run of runs.filter((r) => r.status === "failed")) {
      const fp = (run.error_message ?? "Unknown error").slice(0, 80);
      const existing = errorGroupMap.get(fp);
      if (existing) {
        existing.count++;
        existing.runs.push(run);
      } else {
        const connector = run.programs?.name ?? "Unknown";
        errorGroupMap.set(fp, { fingerprint: fp, count: 1, runs: [run], connector });
      }
    }
  }
  const errorGroups = [...errorGroupMap.values()].sort((a, b) => b.count - a.count);

  const STATUS_FILTERS = [
    { label: t("filterAll"),       value: "" },
    { label: t("filterRunning"),   value: "running" },
    { label: t("filterCompleted"), value: "completed" },
    { label: t("filterFailed"),    value: "failed" },
    { label: t("filterCancelled"), value: "cancelled" },
  ];

  const filterCounts: Record<string, number> = {
    "":          runs.length,
    running:     runs.filter((r) => r.status === "running").length,
    completed:   runs.filter((r) => ["completed", "success"].includes(r.status)).length,
    failed:      runs.filter((r) => r.status === "failed").length,
    cancelled:   runs.filter((r) => r.status === "cancelled").length,
  };

  return (
    <div className="space-y-5 text-foreground">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {runs24h.length} in last 24h
            {runningNow > 0 && <> · <span className="text-yellow-500">{runningNow} running now</span></>}
            {failedRuns24h.length > 0 && <> · <span className="text-red-400">{failedRuns24h.length} failed</span></>}
            {okRuns.length > 0 && <> · {okRuns.length} ok</>}
            {cancelledRuns24h.length > 0 && <> · {cancelledRuns24h.length} cancelled</>}
            {durations.length > 0 && (
              <> · P50 {formatDuration(p50ms)} · P95 {formatDuration(p95ms)}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {runningNow > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live · auto
            </span>
          )}
          <Link
            href="/runs"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"/><path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"/></svg>
            Export
          </Link>
          {failedRuns24h.length > 0 && (
            <Link
              href="/runs?status=failed"
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/15 transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1ZM8 9.5a.75.75 0 0 0 0-1.5.75.75 0 0 0 0 1.5ZM7.25 6.75a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-1.5 0v-1.5Z"/></svg>
              Alerts · {failedRuns24h.length}
            </Link>
          )}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm.75 4.75v-.5a.75.75 0 0 0-1.5 0v.5a.75.75 0 0 0 1.5 0ZM8 6.5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 6.5Z"/></svg>
            Trigger run
          </Link>
        </div>
      </div>

      {/* ── Stats cards ── */}
      {runs24h.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-border bg-card px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Total Runs · 24H</p>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (okRuns.length / runs24h.length) * 100)}%`, background: "linear-gradient(to right, hsl(var(--primary)), #22c55e)" }} />
              </div>
            </div>
            <p className="text-xl font-black tabular-nums mt-1.5">{runs24h.length}</p>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">{okRuns.length} completed cleanly</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Success Rate</p>
            <p className={`text-xl font-black tabular-nums ${successRate !== null && successRate < 50 ? "text-red-400" : successRate !== null && successRate < 80 ? "text-yellow-500" : "text-foreground"}`}>
              {successRate !== null ? `${successRate}%` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">{okRuns.length} of {runs24h.length} completed</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Failed</p>
            <p className={`text-xl font-black tabular-nums ${failedRuns24h.length > 0 ? "text-red-400" : "text-foreground"}`}>
              {failedRuns24h.length}
            </p>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
              {failedRuns24h.length > 0 ? `across ${new Set(failedRuns24h.map((r) => r.program_id)).size} program${new Set(failedRuns24h.map((r) => r.program_id)).size !== 1 ? "s" : ""}` : "no failures"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">P50 / P95 Duration</p>
            <p className="text-xl font-black tabular-nums">
              {durations.length > 0 ? formatDuration(p50ms) : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
              {durations.length > 0 ? `P95 ${formatDuration(p95ms)}` : "no data"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Concurrency</p>
            <p className="text-xl font-black tabular-nums">{runningNow}</p>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">/ 5 max · queue policy: queue</p>
          </div>
        </section>
      )}

      {/* ── Run volume chart ── */}
      {runs.length > 0 && (
        <section className="rounded-xl border border-border bg-card px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Run Volume · Last 24H</p>
              <p className="text-[11px] text-muted-foreground/40 mt-0.5">Each bar represents a 40-minute window.</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-500/70" />OK {okRuns.length}</span>
              {failedRuns24h.length > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500/70" />Failed {failedRuns24h.length}</span>}
              {cancelledRuns24h.length > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-yellow-500/70" />Cancelled {cancelledRuns24h.length}</span>}
              {runningNow > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-500/70" />Running {runningNow}</span>}
            </div>
          </div>
          <div className="flex items-end gap-0.5 h-16">
            {buckets.map((bucket, i) => {
              const total = bucket.ok + bucket.failed + bucket.cancelled + bucket.running;
              if (total === 0) return <div key={i} className="flex-1 min-w-0 flex items-end"><div className="w-full rounded-sm bg-muted/30" style={{ height: "4px" }} /></div>;
              const pct = (total / maxBucket) * 100;
              const okPct   = total > 0 ? (bucket.ok       / total) * 100 : 0;
              const failPct = total > 0 ? (bucket.failed    / total) * 100 : 0;
              const canPct  = total > 0 ? (bucket.cancelled / total) * 100 : 0;
              return (
                <div key={i} className="flex-1 min-w-0 flex items-end" title={`${total} run${total !== 1 ? "s" : ""}: ${bucket.ok} ok, ${bucket.failed} failed`}>
                  <div className="w-full rounded-sm overflow-hidden flex flex-col-reverse" style={{ height: `${Math.max(8, pct)}%` }}>
                    {bucket.ok > 0        && <div style={{ height: `${okPct}%`,   backgroundColor: "rgba(34,197,94,0.7)" }} />}
                    {bucket.failed > 0    && <div style={{ height: `${failPct}%`, backgroundColor: "rgba(239,68,68,0.7)" }} />}
                    {bucket.cancelled > 0 && <div style={{ height: `${canPct}%`,  backgroundColor: "rgba(234,179,8,0.7)" }} />}
                    {bucket.running > 0   && <div style={{ height: "100%",        backgroundColor: "rgba(59,130,246,0.7)" }} />}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground/40">
            <span>−24h</span><span>−18h</span><span>−12h</span><span>−6h</span><span>now</span>
          </div>
        </section>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status tabs */}
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-1 shrink-0 flex-wrap">
          {STATUS_FILTERS.map(({ label, value }) => {
            const count = filterCounts[value] ?? 0;
            return (
              <Link
                key={label}
                href={value ? `/runs?status=${value}` : "/runs"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  (resolvedSearchParams.status ?? "") === value
                    ? "bg-accent text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    (resolvedSearchParams.status ?? "") === value
                      ? "bg-muted text-foreground"
                      : "bg-muted/60 text-muted-foreground/70"
                  }`}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Group / sort */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <Link
            href={groupByError ? "/runs" : "/runs?group=error"}
            className={`rounded-lg border px-3 py-1.5 font-medium transition-colors ${
              groupByError
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-card hover:bg-accent"
            }`}
          >
            Group: {groupByError ? "error type" : "none"}
          </Link>
          <span className="border border-border bg-card rounded-lg px-3 py-1.5 font-medium">Sort: newest first</span>
        </div>
      </div>

      {/* ── No runs ── */}
      {runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-8 py-16 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground/40">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5">
              <path d="M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531L5.305 13.533A1.5 1.5 0 0 1 3 12.267V3.732Z" />
            </svg>
          </div>
          <p className="text-sm font-semibold">
            {resolvedSearchParams.status ? t("noFilteredRuns", { status: resolvedSearchParams.status }) : t("noRuns")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            {resolvedSearchParams.status ? t("tryDifferentFilter") : t("openWorkflow")}
          </p>
          {!resolvedSearchParams.status && (
            <Link
              href="/dashboard"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("goToWorkflows")}
            </Link>
          )}
        </div>
      ) : groupByError && errorGroups.length > 0 ? (
        /* ── Grouped error view ── */
        <div className="space-y-5">
          {active.length > 0 && !resolvedSearchParams.status && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">Active · {active.length}</h2>
              <RunList runs={active} />
            </section>
          )}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
                Grouped by error fingerprint · {errorGroups.length} groups
              </h2>
              <p className="text-[11px] text-muted-foreground/40">Same root cause grouped together. Resolve one, retry the rest.</p>
            </div>
            <div className="rounded-xl border border-border bg-card divide-y divide-border/60 overflow-hidden">
              {errorGroups.map((group) => (
                <div key={group.fingerprint} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-red-500/20 bg-red-500/10">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-red-400"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1ZM8 9.5a.75.75 0 0 0 0-1.5.75.75 0 0 0 0 1.5ZM7.25 5.25a.75.75 0 0 1 1.5 0v2a.75.75 0 0 1-1.5 0v-2Z"/></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{group.fingerprint}</p>
                    <p className="text-[11px] text-muted-foreground/50 mt-0.5">{group.connector} · network · ERR_RUNTIME</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">{group.count}×</span>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0">
                    <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
                  </svg>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        /* ── Normal list view ── */
        <div className="space-y-5">
          {active.length > 0 && !resolvedSearchParams.status && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">Active · {active.length}</h2>
              </div>
              <RunList runs={active} />
            </section>
          )}
          <section className="space-y-2">
            {active.length > 0 && !resolvedSearchParams.status && (
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
                History · {completed.length}
              </h2>
            )}
            <RunList runs={resolvedSearchParams.status ? runs : completed} />
          </section>
          {runs.length >= 100 && (
            <p className="text-center text-xs text-muted-foreground/40 pb-2">
              Showing latest 200 runs
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Run list ─────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ["running", "waiting_approval", "pending"];

function RunList({ runs }: { runs: RunRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border/60 overflow-hidden">
      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[90px_1fr_130px_100px_80px_24px] gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 border-b border-border/60">
        <span>Status</span>
        <span>Program / Message</span>
        <span>When</span>
        <span>Trigger</span>
        <span className="text-right">Duration</span>
        <span />
      </div>
      {runs.map((run) => (
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
              {run.triggered_by?.includes("schedule") ? (
                <><svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 text-muted-foreground/30"><path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1ZM8 5a.75.75 0 0 0-.75.75v2.5c0 .28.16.537.415.657l2 1a.75.75 0 0 0 .67-1.344L8.75 7.9V5.75A.75.75 0 0 0 8 5Z"/></svg> schedule</>
              ) : (
                <><svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 text-muted-foreground/30"><path d="M2 2.75C2 1.784 2.784 1 3.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 10h-.5a.75.75 0 0 0 0 1.5h.5A3.25 3.25 0 0 0 15.5 8.25v-5.5A3.25 3.25 0 0 0 12.25 0h-8.5A3.25 3.25 0 0 0 .5 3.25v5.5A3.25 3.25 0 0 0 3.75 12h.5a.75.75 0 0 0 0-1.5h-.5C3.093 10.5 2.5 9.907 2.5 9.25v-.5H8a.75.75 0 0 0 0-1.5H2.5V2.75Z"/></svg> manual</>
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
    </div>
  );
}
