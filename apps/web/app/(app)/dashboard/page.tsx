import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Workflow, Sparkles, Clock3, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgramList, type FolderItem, type ProgramListItem } from "@/components/programs/program-list";
import { canManageWorkspace } from "@/lib/workspace-types";
import { DashboardSearch } from "@/components/dashboard/dashboard-search";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { WelcomeHero } from "@/components/dashboard/welcome-hero";
import { RecentRunsList } from "@/components/dashboard/recent-runs-list";
import { getRunUsage } from "@/lib/limits";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getUserCreditBalance } from "@/lib/credits";
import { getTranslations } from "next-intl/server";

type Program = {
  id: string;
  name: string;
  description: string | null;
  execution_mode: string;
  is_active: boolean;
  schema_version: number;
  last_run_at: string | null;
  updated_at: string;
  folder_id: string | null;
};

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

type WorkspaceRow = {
  id: string;
  name: string;
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

function getGreeting(): string {
  const hour = new Date().getUTCHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function formatHeaderDate(): string {
  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  const day = now.getDate();
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dayName} · ${month} ${day} · ${time}`;
}

const NODE_DOT_COLORS = [
  "bg-blue-400", "bg-violet-400", "bg-emerald-400", "bg-amber-400",
  "bg-rose-400", "bg-sky-400", "bg-indigo-400", "bg-teal-400",
];

const CARD_ICON_STYLES = [
  "bg-violet-500/10 text-violet-500",
  "bg-emerald-500/10 text-emerald-500",
  "bg-sky-500/10 text-sky-500",
  "bg-amber-500/10 text-amber-500",
];

const CARD_BAR_COLORS = ["bg-violet-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-rose-500"];

function getDots(id: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    NODE_DOT_COLORS[(id.charCodeAt(i % id.length) + i * 7) % NODE_DOT_COLORS.length]
  );
}

function matchesQuery(values: Array<string | null | undefined>, query: string): boolean {
  if (!query) return true;
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

function getSearchQuery(searchParams?: { q?: string | string[] }): string {
  const q = searchParams?.q;
  return (Array.isArray(q) ? q[0] : q ?? "").trim();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const t = await getTranslations("dashboard");
  const searchQuery = getSearchQuery(await searchParams);
  const normalizedQuery = searchQuery.toLowerCase();
  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");

  const [workspaceResult, programsResult, connectionsResult, apiKeysResult, foldersResult, runUsage, creditBalance] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name")
      .eq("id", activeWorkspace.workspaceId)
      .single(),
    supabase
      .from("programs")
      .select("id, name, description, execution_mode, is_active, schema_version, last_run_at, updated_at, folder_id")
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
    createServiceClient()
      .from("workspace_folders")
      .select("id, name, color")
      .eq("workspace_id", activeWorkspace.workspaceId)
      .order("created_at", { ascending: true }),
    getRunUsage(user.id, activeWorkspace.workspaceId).catch(() => ({ current: 0, total: null, tier: "free" as const })),
    getUserCreditBalance(user.id).catch(() => null),
  ]);

  const workspace = (workspaceResult.data ?? null) as WorkspaceRow | null;
  const programs = (programsResult.data ?? []) as Program[];
  const connectionCount = connectionsResult.count ?? 0;
  const apiKeyCount = apiKeysResult.count ?? 0;
  const folders = (foldersResult.data ?? []) as FolderItem[];
  const canManageFolders = canManageWorkspace(activeWorkspace.role);
  const programIds = programs.map((p) => p.id);

  let recentRuns: RecentRun[] = [];
  const perProgramStats: Record<string, { total: number; failed: number }> = {};

  if (programIds.length > 0) {
    const serviceClient = createServiceClient();
    const { data } = await serviceClient
      .from("runs")
      .select("id, program_id, status, triggered_by, started_at, completed_at, created_at, programs(name)")
      .in("program_id", programIds)
      .order("created_at", { ascending: false })
      .limit(100);
    recentRuns = (data ?? []) as unknown as RecentRun[];

    for (const run of recentRuns) {
      if (!perProgramStats[run.program_id]) perProgramStats[run.program_id] = { total: 0, failed: 0 };
      perProgramStats[run.program_id].total++;
      if (run.status === "failed") perProgramStats[run.program_id].failed++;
    }
  }

  const displayName = user.email?.split("@")[0] ?? "there";
  const displayNameCapitalized = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  const activePrograms = programs.filter((p) => p.is_active).length;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const failedLast24h = recentRuns.filter((r) => r.status === "failed" && r.created_at > oneDayAgo).length;
  const needsAttentionPrograms = programs.filter((p) => (perProgramStats[p.id]?.failed ?? 0) > 0);
  const attentionCount = needsAttentionPrograms.length;
  const attentionText = attentionCount === 0
    ? "Everything looks good."
    : attentionCount === 1
    ? "One thing needs attention."
    : `${attentionCount} things need attention.`;

  const filteredPrograms = programs.filter((p) =>
    matchesQuery([p.name, p.description, p.execution_mode, p.is_active ? "active" : "inactive"], normalizedQuery)
  );
  const filteredRecentRuns = recentRuns.slice(0, 20).filter((r) =>
    matchesQuery([r.programs?.name, r.status, r.triggered_by, r.id], normalizedQuery)
  );
  const pinnedPrograms = (searchQuery ? filteredPrograms : programs).slice(0, 3);


  return (
    <div className="space-y-5 text-foreground">

      {/* ── Credit warning ── */}
      {creditBalance && creditBalance.total !== Infinity && creditBalance.total < 1 && (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm">
          <p className="text-amber-700 dark:text-amber-300 font-medium">
            {creditBalance.total <= 0
              ? "Platform AI credits exhausted — LLM nodes using the platform key won't run."
              : `Only $${creditBalance.total.toFixed(2)} in platform AI credits remaining.`}
          </p>
          <Link
            href="/plan"
            className="shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
          >
            Buy credits
          </Link>
        </section>
      )}

      {/* ── Hero ── */}
      <section>
        <p className="mb-3 text-[11px] text-muted-foreground/60">
          {formatHeaderDate()} · {workspace?.name ?? `${displayName}'s workspace`}
        </p>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight leading-snug">
              Good {getGreeting()}, {displayNameCapitalized}.{" "}
              <span className="italic font-normal text-muted-foreground">{attentionText}</span>
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              <span>{activePrograms} of {programs.length} programs active</span>
              {failedLast24h > 0 && (
                <> · <span className="text-red-500">{failedLast24h} failed run{failedLast24h !== 1 ? "s" : ""} in the last 24h</span></>
              )}
              {connectionCount > 0 && (
                <> · <span className="text-green-600 dark:text-green-500">All {connectionCount} connection{connectionCount !== 1 ? "s" : ""} healthy</span></>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/programs/import">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Import
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/programs/new">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Generate with AI
              </Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/programs/new">
                <Plus className="h-3.5 w-3.5" />
                Create program
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Search ── */}
      <section className="flex items-center gap-3">
        <div className="flex-1">
          <DashboardSearch initialValue={searchQuery} />
        </div>
        <div className="hidden sm:flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-1 py-1 text-xs">
          <span className="rounded-md bg-background px-2.5 py-1 font-medium shadow-sm">All</span>
          <Link href="/programs" className="px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors">Programs</Link>
          <Link href="/runs" className="px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors">Runs</Link>
          <span className="px-2.5 py-1 text-muted-foreground font-mono">⌘K</span>
        </div>
      </section>

      {/* ── First-run welcome ── */}
      {programs.length === 0 && !searchQuery && <WelcomeHero />}

      {/* ── Stats cards ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border glass-card px-5 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{t("programs")}</p>
          <p className="text-2xl font-black tabular-nums">{programs.length}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/60">
            {programs.filter((p) => p.execution_mode === "autonomous").length} autonomous · {programs.filter((p) => p.execution_mode !== "autonomous").length} manual
          </p>
        </div>
        <div className="rounded-xl border glass-card px-5 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{t("active")}</p>
          <p className="text-2xl font-black tabular-nums">{activePrograms}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/60">
            {activePrograms === 0 ? "none currently running" : `${activePrograms} running now`}
          </p>
        </div>
        <div className="rounded-xl border glass-card px-5 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{t("connections")}</p>
          <p className={`text-2xl font-black tabular-nums ${connectionCount > 0 ? "text-green-500" : ""}`}>{connectionCount}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/60">
            {connectionCount === 0 ? "none connected" : "all healthy"}
          </p>
        </div>
        <div className="rounded-xl border glass-card px-5 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{t("runsThisMonth")}</p>
          <p className={`text-2xl font-black tabular-nums ${runUsage.total && runUsage.current / runUsage.total >= 0.8 ? "text-yellow-500" : ""}`}>
            {runUsage.current}
            {runUsage.total !== null && (
              <span className="ml-1 text-sm font-normal text-muted-foreground/70">/ {runUsage.total}</span>
            )}
          </p>
          {runUsage.total !== null ? (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  runUsage.current / runUsage.total >= 0.9 ? "bg-destructive" :
                  runUsage.current / runUsage.total >= 0.8 ? "bg-yellow-500" : "bg-primary"
                }`}
                style={{ width: `${Math.min(100, (runUsage.current / runUsage.total) * 100)}%` }}
              />
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground/60">unlimited</p>
          )}
        </div>
      </section>

      {/* ── Pinned Agents ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Pinned agents {pinnedPrograms.length} of {programs.length}
            {programs.length > 0 && (
              <span className="font-normal normal-case tracking-normal ml-2 text-muted-foreground/40">
                — Quick access to the workflows you reach for most
              </span>
            )}
          </p>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
              <Link href="/programs">View all</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pinnedPrograms.map((program, index) => {
            const stats = perProgramStats[program.id] ?? { total: 0, failed: 0 };
            const hasFailed = stats.failed > 0;
            const iconStyle = CARD_ICON_STYLES[index % CARD_ICON_STYLES.length];
            const barColor = CARD_BAR_COLORS[index % CARD_BAR_COLORS.length];
            const dotCount = 3 + (index % 3);
            const dots = getDots(program.id, dotCount);

            return (
              <Link
                key={program.id}
                href={`/programs/${program.id}`}
                className="group flex flex-col rounded-2xl border glass-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconStyle}`}>
                    {index === 0 ? <Sparkles className="h-5 w-5" /> : index === 1 ? <Workflow className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                  </div>
                </div>

                <p className="font-semibold leading-snug">{program.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/70 flex-1">
                  {program.description ?? "Automation workspace ready for new workflows."}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {hasFailed && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                      <span className="h-1 w-1 rounded-full bg-red-500" />
                      {stats.failed} failed
                    </span>
                  )}
                  {program.is_active && !hasFailed && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600">
                      <span className="relative flex h-1 w-1">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-50 [animation-duration:2.5s]" />
                        <span className="relative h-1 w-1 rounded-full bg-green-500" />
                      </span>
                      Healthy
                    </span>
                  )}
                  {!program.is_active && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Inactive
                    </span>
                  )}
                  <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
                    v{program.schema_version} schema
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-1">
                  {dots.map((color, i) => (
                    <span key={i} className={`h-2 w-2 rounded-full ${color} opacity-70`} />
                  ))}
                  <span className="ml-1 text-[10px] text-muted-foreground/50">{dotCount} nodes</span>
                </div>

                <div className="mt-3 border-t border-border/60 pt-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      {program.is_active && !hasFailed && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-40 [animation-duration:2.5s]" />
                      )}
                      <span className={`relative h-1.5 w-1.5 rounded-full ${hasFailed ? "bg-red-500" : program.is_active ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                    </span>
                    {hasFailed ? `Failed · ${program.last_run_at ? timeAgo(program.last_run_at) : "—"}` : program.last_run_at ? `Last run ${timeAgo(program.last_run_at)}` : "Never run"}
                  </span>
                  {stats.total > 0 && (
                    <span className="text-[11px] text-muted-foreground/50">{stats.total} runs</span>
                  )}
                </div>
              </Link>
            );
          })}

          {pinnedPrograms.length < 3 && (
            <Link
              href="/programs/new"
              className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] backdrop-blur-md p-5 text-center transition-all hover:border-primary/40 hover:bg-white/[0.05] min-h-[180px]"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border glass-card text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-colors">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Create program</p>
                <p className="mt-0.5 text-xs text-muted-foreground/60">Start blank or generate with AI</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium">Blank</span>
                <span className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                  <Sparkles className="h-3 w-3" />
                  Prompt
                </span>
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* ── All Activity ── */}
      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          All activity {programs.length > 0 && `${programs.length} programs`}
          <span className="font-normal normal-case tracking-normal ml-2 text-muted-foreground/40">
            — Workflows on the left, run history on the right
          </span>
        </p>

        <div className="rounded-2xl border glass-panel overflow-hidden">
          <div className="grid grid-cols-1 divide-y divide-border/40 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
            {/* ── Program list with folders ── */}
            <div className="lg:col-span-3">
              <ProgramList
                workspaceId={activeWorkspace.workspaceId}
                initialPrograms={programs as ProgramListItem[]}
                initialFolders={folders}
                stats={perProgramStats}
                canManage={canManageFolders}
                searchQuery={normalizedQuery}
              />
            </div>

            {/* ── Recent Runs ── */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
                <div>
                  <p className="text-xs font-semibold">Recent runs</p>
                  <p className="text-[10px] text-muted-foreground/60">Last 24 hours across all programs</p>
                </div>
                <Link href="/runs" className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors">
                  View all →
                </Link>
              </div>

              <RecentRunsList runs={filteredRecentRuns} searchQuery={searchQuery} />
            </div>
          </div>
        </div>
      </section>

      <OnboardingChecklist
        hasPrograms={programs.length > 0}
        hasConnections={connectionCount > 0}
        hasApiKeys={apiKeyCount > 0}
      />
    </div>
  );
}
