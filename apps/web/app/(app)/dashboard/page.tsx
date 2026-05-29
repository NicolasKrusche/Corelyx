import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Folder, Star } from "lucide-react";
import { ProgramList, type FolderItem, type ProgramListItem } from "@/components/programs/program-list";
import { canManageWorkspace } from "@/lib/workspace-types";
import { DashboardSearch } from "@/components/dashboard/dashboard-search";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { DashboardAiPanel } from "@/components/dashboard/dashboard-ai-panel";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getUserCreditBalance } from "@/lib/credits";
import { cn } from "@/lib/utils";

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

type WorkspaceRow = {
  id: string;
  name: string;
};

function getSearchQuery(searchParams?: { q?: string | string[] }): string {
  const q = searchParams?.q;
  return (Array.isArray(q) ? q[0] : q ?? "").trim();
}

// ─── Starred card ─────────────────────────────────────────────────────────────

const FOLDER_COLORS = [
  "bg-violet-500/10 text-violet-500 border-violet-500/20",
  "bg-sky-500/10 text-sky-500 border-sky-500/20",
  "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "bg-rose-500/10 text-rose-500 border-rose-500/20",
];

function StarredCard({
  program,
  totalRuns,
  colorIdx,
}: {
  program: Program;
  totalRuns: number;
  colorIdx: number;
}) {
  const colors = FOLDER_COLORS[colorIdx % FOLDER_COLORS.length];
  return (
    <Link
      href={`/programs/${program.id}`}
      className="group flex w-36 flex-col rounded-xl border border-border bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-lg border", colors)}>
        <Folder className="h-4 w-4" />
      </div>
      <p className="truncate text-sm font-semibold leading-snug">{program.name}</p>
      <p className="mt-auto pt-4 text-[10px] text-muted-foreground/60">
        {totalRuns} run{totalRuns !== 1 ? "s" : ""}
      </p>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const searchQuery = getSearchQuery(await searchParams);
  const normalizedQuery = searchQuery.toLowerCase();
  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");

  const [workspaceResult, programsResult, connectionsResult, apiKeysResult, foldersResult, creditBalance] = await Promise.all([
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
    getUserCreditBalance(user.id).catch(() => null),
  ]);

  const workspace = (workspaceResult.data ?? null) as WorkspaceRow | null;
  const programs = (programsResult.data ?? []) as Program[];
  const connectionCount = connectionsResult.count ?? 0;
  const apiKeyCount = apiKeysResult.count ?? 0;
  const folders = (foldersResult.data ?? []) as FolderItem[];
  const canManageFolders = canManageWorkspace(activeWorkspace.role);
  const programIds = programs.map((p) => p.id);

  const perProgramStats: Record<string, { total: number; failed: number }> = {};

  if (programIds.length > 0) {
    const serviceClient = createServiceClient();
    const { data } = await serviceClient
      .from("runs")
      .select("id, program_id, status")
      .in("program_id", programIds)
      .order("created_at", { ascending: false })
      .limit(200);

    for (const run of (data ?? []) as { id: string; program_id: string; status: string }[]) {
      if (!perProgramStats[run.program_id]) perProgramStats[run.program_id] = { total: 0, failed: 0 };
      perProgramStats[run.program_id].total++;
      if (run.status === "failed") perProgramStats[run.program_id].failed++;
    }
  }

  // First 3 programs act as "starred" for the quick-access section
  const starredPrograms = programs.slice(0, 3);

  return (
    <div className="flex min-h-0 gap-5 text-foreground">
      {/* ── Left: AI panel ─────────────────────────────────────────────── */}
      <aside className="w-64 xl:w-72 shrink-0">
        <DashboardAiPanel />
      </aside>

      {/* ── Right: workspace browser ────────────────────────────────────── */}
      <div className="min-w-0 flex-1 space-y-5">

        {/* Credit warning */}
        {creditBalance && creditBalance.total !== Infinity && creditBalance.total < 1 && (
          <section className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-300">
              {creditBalance.total <= 0
                ? "Platform AI credits exhausted — LLM nodes using the platform key won't run."
                : `Only $${creditBalance.total.toFixed(2)} in platform AI credits remaining.`}
            </p>
            <Link
              href="/plan"
              className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
            >
              Buy credits
            </Link>
          </section>
        )}

        {/* Search */}
        <DashboardSearch initialValue={searchQuery} />

        {/* Starred section */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              Starred
            </h2>
          </div>

          {starredPrograms.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {starredPrograms.map((program, i) => (
                <StarredCard
                  key={program.id}
                  program={program}
                  totalRuns={perProgramStats[program.id]?.total ?? 0}
                  colorIdx={i}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 px-5 py-4 text-[12px] text-muted-foreground/50">
              No starred programs yet. Star a program to pin it here.
            </div>
          )}
        </section>

        {/* Workspace programs table */}
        <section>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">{workspace?.name ?? "Workspace"}</h2>
              <Link
                href="/programs/new"
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-accent transition-colors"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
                  <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                </svg>
                New
              </Link>
            </div>

            <ProgramList
              workspaceId={activeWorkspace.workspaceId}
              initialPrograms={programs as ProgramListItem[]}
              initialFolders={folders}
              stats={perProgramStats}
              canManage={canManageFolders}
              searchQuery={normalizedQuery}
            />
          </div>
        </section>

        <OnboardingChecklist
          hasPrograms={programs.length > 0}
          hasConnections={connectionCount > 0}
          hasApiKeys={apiKeyCount > 0}
        />
      </div>
    </div>
  );
}
