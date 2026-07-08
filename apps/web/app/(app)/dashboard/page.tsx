import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FolderKanban,
  Plus,
  Sparkles,
} from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { ProgramList, type FolderItem, type ProgramListItem } from "@/components/programs/program-list";
import { DashboardSearch } from "@/components/dashboard/dashboard-search";
import { CineEyebrow, CINE_TITLE } from "@/components/cinematic";
import {
  DashboardAttentionPanel,
  type DashboardApproval,
  type DashboardFailedRun,
} from "@/components/dashboard/dashboard-attention-panel";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { ProductTour } from "@/components/dashboard/product-tour";
import { UpgradeBannerNudge } from "@/components/dashboard/upgrade-banner-nudge";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getUserCreditBalance } from "@/lib/credits";
import { formatCredits } from "@/lib/credit-packs";
import { canManageWorkspace } from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

type Program = ProgramListItem;

type WorkspaceRow = {
  id: string;
  name: string;
};

type RunRow = {
  id: string;
  program_id: string;
  status: string;
  triggered_by: string;
  created_at: string;
};

type ProgramConnectionRow = {
  program_id: string;
  connection_id: string;
};

type TriggerRow = {
  program_id: string;
  type: string;
  next_run_at: string | null;
};

export type ProgramSchedule = { type: string; nextRunAt: string | null };

type ConnectionRow = {
  id: string;
  provider: string;
};

type ApprovalRow = {
  id: string;
  status: string;
  created_at: string;
  context: {
    node_label?: string;
    reason?: string;
  } | null;
  node_executions: {
    node_id: string;
    run_id: string;
    runs: {
      program_id: string;
      programs: {
        name: string;
      } | null;
    } | null;
  } | null;
};

function getSearchQuery(searchParams?: { q?: string | string[] }): string {
  const q = searchParams?.q;
  return (Array.isArray(q) ? q[0] : q ?? "").trim();
}

function sparklinePoints(values: number[], width: number, height: number) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - 2 - ((value - min) / range) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// Node-chip styling lifted from the landing film's scene kit: each stat reads
// like a glowing workflow node — tone hairline on top, glowing status dot, and
// a sparkline with a soft bloom.
const STAT_TONES = {
  green: {
    icon: "bg-emerald-500/10 text-emerald-500",
    line: "via-emerald-500/50",
    dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]",
    spark: "stroke-emerald-500 [filter:drop-shadow(0_0_3px_rgba(16,185,129,0.45))]",
  },
  blue: {
    icon: "bg-sky-500/10 text-sky-500",
    line: "via-sky-500/50",
    dot: "bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]",
    spark: "stroke-sky-500 [filter:drop-shadow(0_0_3px_rgba(14,165,233,0.45))]",
  },
  violet: {
    icon: "bg-violet-500/10 text-violet-500",
    line: "via-violet-500/50",
    dot: "bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)]",
    spark: "stroke-violet-500 [filter:drop-shadow(0_0_3px_rgba(139,92,246,0.45))]",
  },
  amber: {
    icon: "bg-amber-500/10 text-amber-500",
    line: "via-amber-500/50",
    dot: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]",
    spark: "stroke-amber-500 [filter:drop-shadow(0_0_3px_rgba(245,158,11,0.45))]",
  },
} as const;

type StatTone = keyof typeof STAT_TONES;

function StatSparkline({ tone, values }: { tone: StatTone; values: number[] }) {
  return (
    <svg viewBox="0 0 80 28" aria-hidden="true" className={cn("h-8 w-20 fill-none", STAT_TONES[tone].spark)}>
      <polyline
        points={sparklinePoints(values, 80, 28)}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function StatCard({
  label,
  value,
  detail,
  Icon,
  tone,
  series,
}: {
  label: string;
  value: string;
  detail: string;
  Icon: typeof Activity;
  tone: StatTone;
  series: number[];
}) {
  const tones = STAT_TONES[tone];

  return (
    <section className="group relative overflow-hidden rounded-2xl border glass-card p-4 shadow-sm transition-transform duration-300 hover:-translate-y-0.5">
      <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent", tones.line)} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tones.icon)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">{label}</span>
        </div>
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tones.dot)} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-black tabular-nums tracking-tight text-foreground">{value}</p>
        <StatSparkline tone={tone} values={series} />
      </div>
      <p className="mt-2 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">{detail}</p>
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const t = await getTranslations("dashboard");
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");

  const searchQuery = getSearchQuery(await searchParams);
  const normalizedQuery = searchQuery.toLowerCase();
  const serviceClient = createServiceClient();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    workspaceResult,
    profileResult,
    programsResult,
    connectionsResult,
    apiKeysResult,
    foldersResult,
    creditBalance,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name")
      .eq("id", activeWorkspace.workspaceId)
      .single(),
    supabase.from("profiles").select("display_name, tier").eq("id", user.id).single(),
    supabase
      .from("programs")
      .select("id, name, description, execution_mode, is_active, schema_version, last_run_at, created_at, updated_at, folder_id")
      .eq("workspace_id", activeWorkspace.workspaceId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", activeWorkspace.workspaceId),
    supabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", activeWorkspace.workspaceId),
    serviceClient
      .from("workspace_folders")
      .select("id, name, color")
      .eq("workspace_id", activeWorkspace.workspaceId)
      .order("created_at", { ascending: true }),
    getUserCreditBalance(user.id).catch(() => null),
  ]);

  const workspace = (workspaceResult.data ?? null) as WorkspaceRow | null;
  const programs = (programsResult.data ?? []) as Program[];
  const folders = (foldersResult.data ?? []) as FolderItem[];
  const programIds = programs.map((program) => program.id);
  const canManageFolders = canManageWorkspace(activeWorkspace.role);

  let recentRuns: RunRow[] = [];
  let pendingApprovals: DashboardApproval[] = [];
  let programConnections: ProgramConnectionRow[] = [];
  let connections: ConnectionRow[] = [];

  const programSchedules = new Map<string, ProgramSchedule>();

  if (programIds.length > 0) {
    const [runsResult, approvalsResult, programConnectionsResult, triggersResult] = await Promise.all([
      serviceClient
        .from("runs")
        .select("id, program_id, status, triggered_by, created_at")
        .in("program_id", programIds)
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false })
        .limit(5000),
      serviceClient
        .from("approvals")
        .select(
          `id,
           status,
           created_at,
           context,
           node_executions (
             node_id,
             run_id,
             runs (
               program_id,
               programs (
                 name
               )
             )
           )`
        )
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5000),
      serviceClient
        .from("program_connections")
        .select("program_id, connection_id")
        .in("program_id", programIds),
      // Active, non-manual triggers — surfaces "this runs on autopilot" independent
      // of program.is_active and of how recently it last fired (a daily cron looks
      // idle 23.9 hours out of 24 otherwise).
      serviceClient
        .from("triggers")
        .select("program_id, type, next_run_at")
        .in("program_id", programIds)
        .eq("is_active", true)
        .neq("type", "manual"),
    ]);

    recentRuns = (runsResult.data ?? []) as RunRow[];
    programConnections = (programConnectionsResult.data ?? []) as ProgramConnectionRow[];

    // Prefer a cron trigger (has a concrete next_run_at) over other automated
    // trigger types; among crons, keep the one firing soonest.
    for (const trigger of (triggersResult.data ?? []) as TriggerRow[]) {
      const existing = programSchedules.get(trigger.program_id);
      if (trigger.type === "cron" && trigger.next_run_at) {
        if (!existing || existing.type !== "cron" || (existing.nextRunAt && trigger.next_run_at < existing.nextRunAt)) {
          programSchedules.set(trigger.program_id, { type: "cron", nextRunAt: trigger.next_run_at });
        }
      } else if (!existing) {
        programSchedules.set(trigger.program_id, { type: trigger.type, nextRunAt: trigger.next_run_at });
      }
    }
    pendingApprovals = ((approvalsResult.data ?? []) as unknown as ApprovalRow[])
      .filter((approval) => {
        const programId = approval.node_executions?.runs?.program_id;
        return programId != null && programIds.includes(programId);
      })
      .map((approval) => ({
        id: approval.id,
        createdAt: approval.created_at,
        nodeLabel: approval.context?.node_label ?? approval.node_executions?.node_id ?? t("reviewRequired"),
        reason: approval.context?.reason ?? null,
        programId: approval.node_executions?.runs?.program_id ?? "",
        programName: approval.node_executions?.runs?.programs?.name ?? t("unknownWorkflow"),
        runId: approval.node_executions?.run_id ?? "",
      }));

    const connectionIds = [...new Set(programConnections.map((connection) => connection.connection_id))];
    if (connectionIds.length > 0) {
      const { data } = await serviceClient
        .from("connections")
        .select("id, provider")
        .in("id", connectionIds)
        .eq("workspace_id", activeWorkspace.workspaceId);
      connections = (data ?? []) as ConnectionRow[];
    }
  }

  const dayKeys = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
  const bucketValues = (items: Array<{ created_at: string }>) => {
    const buckets = new Map(dayKeys.map((key) => [key, 0]));
    for (const item of items) {
      const key = item.created_at.slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return dayKeys.map((key) => buckets.get(key) ?? 0);
  };
  const providerByConnectionId = new Map(connections.map((connection) => [connection.id, connection.provider]));
  const providersByProgramId = new Map<string, Set<string>>();
  for (const link of programConnections) {
    const provider = providerByConnectionId.get(link.connection_id);
    if (!provider) continue;
    if (!providersByProgramId.has(link.program_id)) providersByProgramId.set(link.program_id, new Set());
    providersByProgramId.get(link.program_id)?.add(provider);
  }
  const perProgramStats: Record<string, { total: number; failed: number; runSeries: number[]; providers: string[]; lastRunAt: string | null; schedule: ProgramSchedule | null }> = {};
  for (const program of programs) {
    perProgramStats[program.id] = {
      total: 0,
      failed: 0,
      runSeries: dayKeys.map(() => 0),
      providers: [...(providersByProgramId.get(program.id) ?? [])],
      lastRunAt: null,
      schedule: programSchedules.get(program.id) ?? null,
    };
  }
  for (const run of recentRuns) {
    if (!perProgramStats[run.program_id]) {
      perProgramStats[run.program_id] = { total: 0, failed: 0, runSeries: dayKeys.map(() => 0), providers: [], lastRunAt: null, schedule: programSchedules.get(run.program_id) ?? null };
    }
    perProgramStats[run.program_id].total++;
    if (run.status === "failed") perProgramStats[run.program_id].failed++;
    const dayIndex = dayKeys.indexOf(run.created_at.slice(0, 10));
    if (dayIndex >= 0) perProgramStats[run.program_id].runSeries[dayIndex]++;
    // recentRuns is ordered created_at DESC, so the first run seen per program
    // is the most recent — record it as a fallback for the "Last run" column.
    if (!perProgramStats[run.program_id].lastRunAt) {
      perProgramStats[run.program_id].lastRunAt = run.created_at;
    }
  }

  const runsThisWeek = recentRuns.filter((run) => run.created_at >= weekAgo);
  const completedThisWeek = runsThisWeek.filter((run) => run.status === "completed").length;
  const failedThisWeek = runsThisWeek.filter((run) => run.status === "failed").length;
  const terminalRunsThisWeek = completedThisWeek + failedThisWeek;
  const successRate = terminalRunsThisWeek > 0 ? Math.round((completedThisWeek / terminalRunsThisWeek) * 1000) / 10 : null;
  const successRateDetail = runsThisWeek.length === 0
    ? t("noRunsYet")
    : terminalRunsThisWeek === 0
      ? t("noCompletedRuns")
      : failedThisWeek > 0
        ? t("failedCount", { count: failedThisWeek })
        : t("onTrack");
  // programs.is_active is never set by any UI action — an active, enabled
  // trigger (programSchedules) is what actually determines whether a workflow
  // runs on its own, so that's the real "active" signal here.
  const activeWorkflowSeries = dayKeys.map((key) =>
    programs.filter((program) => programSchedules.has(program.id) && program.created_at.slice(0, 10) <= key).length
  );
  const runsSeries = bucketValues(runsThisWeek);
  const successRateSeries = dayKeys.map((key) => {
    const dailyRuns = runsThisWeek.filter((run) => run.created_at.startsWith(key));
    const completed = dailyRuns.filter((run) => run.status === "completed").length;
    const terminal = completed + dailyRuns.filter((run) => run.status === "failed").length;
    return terminal > 0 ? Math.round((completed / terminal) * 100) : 0;
  });
  const approvalsSeries = bucketValues(
    pendingApprovals.map((approval) => ({ created_at: approval.createdAt }))
  );
  // One attention item per program with a recent failure (its most recent
  // failed run) — the exact set the "Needs attention" program-list tab counts,
  // so the badge number always matches what this panel renders.
  const failedRuns: DashboardFailedRun[] = [];
  const seenFailedPrograms = new Set<string>();
  for (const run of recentRuns) {
    if (run.status !== "failed" || seenFailedPrograms.has(run.program_id)) continue;
    seenFailedPrograms.add(run.program_id);
    failedRuns.push({
      id: run.id,
      createdAt: run.created_at,
      programId: run.program_id,
      programName: programs.find((program) => program.id === run.program_id)?.name ?? t("unknownWorkflow"),
      triggeredBy: run.triggered_by,
    });
  }
  const profile = profileResult.data as { display_name?: string | null; tier?: string | null } | null;
  const displayName = profile?.display_name?.split(" ")[0];
  const isFreeTier = (profile?.tier ?? "free") === "free";
  const workspaceName = workspace?.name ?? t("unknownWorkflow");

  return (
    <div className="relative mx-auto w-full max-w-[1480px] space-y-5 pb-8 text-foreground">
      {isFreeTier && <UpgradeBannerNudge />}

      {creditBalance && creditBalance.total !== Infinity && creditBalance.total < 1_000 && (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-300">
            {creditBalance.total <= 0
              ? t("creditWarning")
              : t("creditsLow", { count: formatCredits(creditBalance.total) })}
          </p>
          <Link
            href="/plan"
            className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
          >
            {t("buyCredits")}
          </Link>
        </section>
      )}

      <header className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <CineEyebrow>{t("overview")}</CineEyebrow>
          <h1 className={cn("mt-2 text-3xl", CINE_TITLE)}>
            {displayName ? t("greetingNamed", { name: displayName }) : t("greetingAnon")}
          </h1>
          <p className="mt-1.5 font-mono text-xs text-muted-foreground">
            {programs.length === 1
              ? t("subheadingSingular", { workspace: workspaceName, count: 1 })
              : t("subheadingPlural", { workspace: workspaceName, count: programs.length })}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center 2xl:w-auto">
          <DashboardSearch initialValue={searchQuery} />
          <Link
            href="/programs/new"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_0_28px_-8px_hsl(var(--primary)/0.7)] transition-all hover:-translate-y-0.5 hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            {t("newWorkflow")}
          </Link>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("activeWorkflows")} value={String(programs.filter((program) => programSchedules.has(program.id)).length)} detail={t("totalCount", { count: programs.length })} Icon={FolderKanban} tone="green" series={activeWorkflowSeries} />
        <StatCard label={t("runsThisWeek")} value={runsThisWeek.length.toLocaleString()} detail={t("sevenDayView")} Icon={Activity} tone="blue" series={runsSeries} />
        <StatCard label={t("successRate")} value={successRate === null ? "-%" : `${successRate}%`} detail={successRateDetail} Icon={CheckCircle2} tone="violet" series={successRateSeries} />
        <StatCard label={t("awaitingYou")} value={String(pendingApprovals.length)} detail={pendingApprovals.length > 0 ? t("reviewNow") : t("allClear")} Icon={CircleAlert} tone="amber" series={approvalsSeries} />
      </div>

      <section
        data-tour="genesis"
        className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.09] via-card/80 to-card/60 shadow-sm backdrop-blur-md"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        {/* Flowing signal line — the landing's "AI signal" motif, at whisper volume. */}
        <svg aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-6 w-full">
          <line
            x1="0"
            y1="50%"
            x2="100%"
            y2="50%"
            stroke="hsl(var(--primary) / 0.22)"
            strokeWidth="1"
            strokeDasharray="4 6"
            className="edge-hero"
          />
        </svg>
        <div className="relative flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-[0_0_28px_-6px_hsl(var(--primary)/0.55)] ring-1 ring-primary/25">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold">{t("genesisTitle")}</p>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {t("genesisDesc")}
              </p>
            </div>
          </div>
          <Link
            href="/programs/new"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 sm:self-auto"
          >
            {t("startGenesis")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="glass-panel overflow-hidden rounded-2xl border shadow-sm">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">{t("yourWorkflows")}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t("workflowsSubtitle", { workspace: workspaceName })}</p>
            </div>
            <Link href="/dashboard" className="text-xs font-semibold text-primary transition-colors hover:text-primary/80">
              {t("viewAll")}
            </Link>
          </div>
          <ProgramList
            workspaceId={activeWorkspace.workspaceId}
            initialPrograms={programs}
            initialFolders={folders}
            stats={perProgramStats}
            canManage={canManageFolders}
            searchQuery={normalizedQuery}
          />
        </section>

        <DashboardAttentionPanel approvals={pendingApprovals} failedRuns={failedRuns} />
      </div>

      <OnboardingChecklist
        hasPrograms={programs.length > 0}
        hasConnections={(connectionsResult.count ?? 0) > 0}
        hasApiKeys={(apiKeysResult.count ?? 0) > 0}
      />

      <Suspense>
        <ProductTour />
      </Suspense>
    </div>
  );
}
