import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Search, Plus, Workflow, Sparkles, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteProgramButton } from "@/components/programs/delete-program-button";
import { GenesisPrompt } from "@/components/dashboard/genesis-prompt";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { getRunUsage } from "@/lib/limits";

type Program = {
  id: string;
  name: string;
  description: string | null;
  execution_mode: string;
  is_active: boolean;
  schema_version: number;
  last_run_at: string | null;
  updated_at: string;
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

const STATUS_COLORS: Record<string, string> = {
  running: "bg-yellow-400",
  completed: "bg-green-500",
  success: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-muted-foreground",
  waiting_approval: "bg-blue-400",
  pending: "bg-muted-foreground",
};

const STATUS_BG: Record<string, string> = {
  running: "bg-yellow-400/10 text-yellow-400",
  completed: "bg-green-500/10 text-green-400",
  success: "bg-green-500/10 text-green-400",
  failed: "bg-red-500/10 text-red-400",
  cancelled: "bg-muted/60 text-muted-foreground",
  waiting_approval: "bg-blue-400/10 text-blue-400",
  pending: "bg-muted/60 text-muted-foreground",
};

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [programsResult, connectionsResult, apiKeysResult, runUsage] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, description, execution_mode, is_active, schema_version, last_run_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    getRunUsage(user.id),
  ]);

  const programs = (programsResult.data ?? []) as Program[];
  const connectionCount = connectionsResult.count ?? 0;
  const apiKeyCount = apiKeysResult.count ?? 0;

  const programIds = programs.map((p) => p.id);
  let recentRuns: RecentRun[] = [];

  if (programIds.length > 0) {
    const serviceClient = createServiceClient();
    const { data } = await serviceClient
      .from("runs")
      .select("id, program_id, status, triggered_by, started_at, completed_at, created_at, programs(name)")
      .in("program_id", programIds)
      .order("created_at", { ascending: false })
      .limit(8);
    recentRuns = (data ?? []) as unknown as RecentRun[];
  }

  const activePrograms = programs.filter((p) => p.is_active).length;
  const displayName = user.email?.split("@")[0] ?? "there";
  const featuredPrograms = programs.slice(0, 2);
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="space-y-6 text-[#1d2433]">
      <section className="rounded-2xl border border-[#d9deea] bg-white/70 p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              aria-label="Search"
              placeholder="Search programs, runs, connections"
              className="h-10 w-full rounded-xl border border-[#d7ddea] bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-[#7d8698] focus:border-indigo-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/programs/import">Import</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/programs/new">
                <Plus className="h-3.5 w-3.5" />
                Create new
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-700">
            {initials}
          </span>
          <p className="font-medium">
            {displayName}&apos;s workspace
            <span className="ml-2 text-xs font-normal text-[#6f7890]">
              Good {getGreeting()}.
            </span>
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {featuredPrograms.length === 0 ? (
          <div className="md:col-span-2 rounded-2xl border border-dashed border-[#d4dbea] bg-white/60 p-6">
            <p className="text-sm font-semibold">No agents yet</p>
            <p className="mt-1 text-xs text-[#6f7890]">
              Create your first automation to populate this workspace board.
            </p>
          </div>
        ) : (
          featuredPrograms.map((program, index) => (
            <Link
              key={program.id}
              href={`/programs/${program.id}`}
              className="group rounded-2xl border border-[#d9deea] bg-white/85 p-5 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                {index === 0 ? <Sparkles className="h-5 w-5" /> : <Workflow className="h-5 w-5" />}
              </div>
              <p className="text-lg font-semibold tracking-tight">{program.name}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[#6f7890]">
                {program.description ?? "Automation workspace ready for new workflows."}
              </p>
              <p className="mt-4 text-[11px] text-[#6f7890]">{program.is_active ? "Active" : "Inactive"} workflow</p>
            </Link>
          ))
        )}

        <Link
          href="/programs/new"
          className="group grid place-items-center rounded-2xl border border-dashed border-[#d1d8e8] bg-white/60 p-5 text-center transition-colors hover:border-indigo-300 hover:bg-white/90"
        >
          <div className="space-y-2">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#d5dcec] bg-white text-[#7a8498] group-hover:text-indigo-600">
              <Plus className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">Create new agent</p>
          </div>
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#d9deea] bg-white/85 px-5 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#7f889b]">Programs</p>
          <p className="text-2xl font-black tabular-nums">{programs.length}</p>
        </div>
        <div className="rounded-xl border border-[#d9deea] bg-white/85 px-5 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#7f889b]">Active</p>
          <p className="text-2xl font-black tabular-nums text-emerald-600">{activePrograms}</p>
        </div>
        <div className="rounded-xl border border-[#d9deea] bg-white/85 px-5 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#7f889b]">Connections</p>
          <p className="text-2xl font-black tabular-nums">{connectionCount}</p>
        </div>
        <div className="rounded-xl border border-[#d9deea] bg-white/85 px-5 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#7f889b]">Runs this month</p>
          <p className={`text-2xl font-black tabular-nums ${runUsage.total && runUsage.current / runUsage.total >= 0.8 ? "text-yellow-400" : ""}`}>
            {runUsage.current}
            {runUsage.total !== null && (
              <span className="ml-1 text-sm font-normal text-[#7f889b]">/ {runUsage.total}</span>
            )}
          </p>
          {runUsage.total !== null && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#e4e8f2]">
              <div
                className={`h-full rounded-full transition-all ${
                  runUsage.current / runUsage.total >= 0.9 ? "bg-destructive" :
                  runUsage.current / runUsage.total >= 0.8 ? "bg-yellow-400" : "bg-primary"
                }`}
                style={{ width: `${Math.min(100, (runUsage.current / runUsage.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#d9deea] bg-white/85 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <Workflow className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-semibold">Workflows</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-[#eef2fb] px-3 py-1 text-[#69758d]">Needs attention</span>
            <span className="rounded-full bg-[#dee6fb] px-3 py-1 text-[#2f3e68]">Recently edited</span>
            <span className="rounded-full bg-[#eef2fb] px-3 py-1 text-[#69758d]">Recently run</span>
            <span className="rounded-full bg-[#eef2fb] px-3 py-1 text-[#69758d]">Starred</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {programs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d5dcec] p-12 text-center">
                <p className="text-sm text-[#69758d]">No workflows match your selected filters.</p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/programs/new">Create a new workflow</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#d8dff0] divide-y divide-[#e4e8f2]">
                {programs.map((p) => (
                  <div key={p.id} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#f2f5fb]">
                    <div className={`h-8 w-1 shrink-0 rounded-full ${p.is_active ? "bg-emerald-500/70 group-hover:bg-emerald-500" : "bg-[#d8deeb]"}`} />

                    <Link href={`/programs/${p.id}`} className="min-w-0 flex-1 py-0.5">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-[#7c8599]">
                        v{p.schema_version} · {p.execution_mode}
                        {p.last_run_at && <> · {timeAgo(p.last_run_at)}</>}
                      </p>
                    </Link>

                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={p.is_active ? "success" : "outline"} className="text-[10px] capitalize">
                        {p.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <DeleteProgramButton programId={p.id} programName={p.name} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[#6f7890]" />
              <h3 className="text-sm font-semibold">Recent runs</h3>
            </div>

            {recentRuns.length === 0 ? (
              <div className="rounded-xl border border-[#d9deea] bg-white/70 p-8 text-center">
                <p className="text-xs font-medium text-[#6f7890]">No runs yet</p>
                <p className="mt-1 text-xs text-[#8892a6]">Open a workflow and click Run.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#d9deea] bg-white/70 divide-y divide-[#e4e8f2]">
                {recentRuns.map((run) => (
                  <Link
                    key={run.id}
                    href={`/programs/${run.program_id}/runs/${run.id}`}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#f2f5fb]"
                  >
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold capitalize ${STATUS_BG[run.status] ?? "bg-muted/60 text-muted-foreground"}`}>
                      <span className={`h-1 w-1 shrink-0 rounded-full ${STATUS_COLORS[run.status] ?? "bg-muted-foreground"}`} />
                      {run.status.replace(/_/g, " ")}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{run.programs?.name ?? "Unknown"}</p>
                      <p className="font-mono text-[11px] text-[#7c8599]">{timeAgo(run.created_at)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <OnboardingChecklist
        hasPrograms={programs.length > 0}
        hasConnections={connectionCount > 0}
        hasApiKeys={apiKeyCount > 0}
      />

      <GenesisPrompt />
    </div>
  );
}
