import Link from "next/link";
import { redirect } from "next/navigation";
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
import {
  DashboardAttentionPanel,
  type DashboardApproval,
  type DashboardFailedRun,
} from "@/components/dashboard/dashboard-attention-panel";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getUserCreditBalance } from "@/lib/credits";
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

function StatSparkline({ tone }: { tone: "green" | "blue" | "violet" | "amber" }) {
  const tones = {
    green: "stroke-emerald-500",
    blue: "stroke-sky-500",
    violet: "stroke-violet-500",
    amber: "stroke-amber-500",
  };

  return (
    <svg viewBox="0 0 80 28" aria-hidden="true" className={cn("h-8 w-20 fill-none", tones[tone])}>
      <path
        d="M1 23 10 18l8 2 9-9 8 2 9-6 9 3 9-7 8 3 9-5"
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
}: {
  label: string;
  value: string;
  detail: string;
  Icon: typeof Activity;
  tone: "green" | "blue" | "violet" | "amber";
}) {
  const tones = {
    green: "bg-emerald-500/10 text-emerald-500",
    blue: "bg-sky-500/10 text-sky-500",
    violet: "bg-violet-500/10 text-violet-500",
    amber: "bg-amber-500/10 text-amber-500",
  };

  return (
    <section className="rounded-2xl border border-border/80 bg-card/80 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tones[tone])}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          {label}
        </div>
        <span className="text-[10px] font-semibold text-emerald-500">{detail}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-black tracking-tight text-foreground">{value}</p>
        <StatSparkline tone={tone} />
      </div>
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
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
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
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

  if (programIds.length > 0) {
    const [runsResult, approvalsResult] = await Promise.all([
      serviceClient
        .from("runs")
        .select("id, program_id, status, triggered_by, created_at")
        .in("program_id", programIds)
        .order("created_at", { ascending: false })
        .limit(500),
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
        .limit(20),
    ]);

    recentRuns = (runsResult.data ?? []) as RunRow[];
    pendingApprovals = ((approvalsResult.data ?? []) as unknown as ApprovalRow[])
      .filter((approval) => {
        const programId = approval.node_executions?.runs?.program_id;
        return programId != null && programIds.includes(programId);
      })
      .map((approval) => ({
        id: approval.id,
        createdAt: approval.created_at,
        nodeLabel: approval.context?.node_label ?? approval.node_executions?.node_id ?? "Review required",
        reason: approval.context?.reason ?? null,
        programId: approval.node_executions?.runs?.program_id ?? "",
        programName: approval.node_executions?.runs?.programs?.name ?? "Unknown workflow",
        runId: approval.node_executions?.run_id ?? "",
      }));
  }

  const perProgramStats: Record<string, { total: number; failed: number }> = {};
  for (const run of recentRuns) {
    if (!perProgramStats[run.program_id]) perProgramStats[run.program_id] = { total: 0, failed: 0 };
    perProgramStats[run.program_id].total++;
    if (run.status === "failed") perProgramStats[run.program_id].failed++;
  }

  const runsThisWeek = recentRuns.filter((run) => run.created_at >= weekAgo);
  const completedThisWeek = runsThisWeek.filter((run) => run.status === "completed").length;
  const failedThisWeek = runsThisWeek.filter((run) => run.status === "failed").length;
  const terminalRunsThisWeek = completedThisWeek + failedThisWeek;
  const successRate = terminalRunsThisWeek > 0 ? Math.round((completedThisWeek / terminalRunsThisWeek) * 1000) / 10 : 100;
  const failedRuns: DashboardFailedRun[] = recentRuns
    .filter((run) => run.status === "failed")
    .slice(0, 4)
    .map((run) => ({
      id: run.id,
      createdAt: run.created_at,
      programId: run.program_id,
      programName: programs.find((program) => program.id === run.program_id)?.name ?? "Unknown workflow",
      triggeredBy: run.triggered_by,
    }));
  const displayName = (profileResult.data as { display_name?: string | null } | null)?.display_name?.split(" ")[0];
  const workspaceName = workspace?.name ?? "Workspace";

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-5 pb-8 text-foreground">
      {creditBalance && creditBalance.total !== Infinity && creditBalance.total < 1 && (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-300">
            {creditBalance.total <= 0
              ? "Platform AI credits exhausted. LLM nodes using the platform key will not run."
              : `Only $${creditBalance.total.toFixed(2)} in platform AI credits remaining.`}
          </p>
          <Link
            href="/plan"
            className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
          >
            Buy credits
          </Link>
        </section>
      )}

      <header className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Overview</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            Good to see you{displayName ? `, ${displayName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {workspaceName} · {programs.length} workflow{programs.length === 1 ? "" : "s"} · operations at a glance
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center 2xl:w-auto">
          <DashboardSearch initialValue={searchQuery} />
          <Link
            href="/programs/new"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New workflow
          </Link>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active workflows" value={String(programs.filter((program) => program.is_active).length)} detail={`${programs.length} total`} Icon={FolderKanban} tone="green" />
        <StatCard label="Runs this week" value={runsThisWeek.length.toLocaleString()} detail={runsThisWeek.length > 0 ? "Live data" : "Ready"} Icon={Activity} tone="blue" />
        <StatCard label="Success rate" value={`${successRate}%`} detail={failedThisWeek > 0 ? `${failedThisWeek} failed` : "On track"} Icon={CheckCircle2} tone="violet" />
        <StatCard label="Awaiting you" value={String(pendingApprovals.length)} detail={pendingApprovals.length > 0 ? "Review now" : "All clear"} Icon={CircleAlert} tone="amber" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.09] via-card/90 to-card/75 shadow-sm">
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold">Build your next workflow with Genesis</p>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Describe the outcome you want. Genesis turns it into a reviewable workflow graph with the right steps and connections.
              </p>
            </div>
          </div>
          <Link
            href="/programs/new"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 sm:self-auto"
          >
            Start with Genesis
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-2xl border border-border/80 bg-card/80 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">Your workflows</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Organize, scan, and open the automations in {workspaceName}.</p>
            </div>
            <Link href="/programs/new" className="text-xs font-semibold text-primary transition-colors hover:text-primary/80">
              View all
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
    </div>
  );
}
