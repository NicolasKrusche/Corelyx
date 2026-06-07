import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bot,
  CheckCircle2,
  CircleDashed,
  CircleX,
  Clock,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";
import { AgentsUpsell } from "./_upsell";

export const metadata = {
  title: "Agents",
  robots: { index: false, follow: false },
};

type AgentRow = {
  id: string;
  name: string;
  description: string | null;
  agent_state: string | null;
  agent_saved_template: boolean | null;
  created_at: string;
};

const STATE_META: Record<
  string,
  { label: string; icon: React.ReactNode; dot: string }
> = {
  draft: {
    label: "Draft",
    icon: <CircleDashed className="h-3.5 w-3.5" />,
    dot: "bg-muted-foreground/40",
  },
  awaiting_approval: {
    label: "Awaiting approval",
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
    dot: "bg-amber-400",
  },
  approved: {
    label: "Approved",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    dot: "bg-blue-400",
  },
  running: {
    label: "Running",
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    dot: "bg-primary",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    dot: "bg-emerald-400",
  },
  failed: {
    label: "Failed",
    icon: <CircleX className="h-3.5 w-3.5" />,
    dot: "bg-destructive",
  },
  discarded: {
    label: "Discarded",
    icon: <CircleDashed className="h-3.5 w-3.5" />,
    dot: "bg-muted-foreground/30",
  },
};

const STATE_COLORS: Record<string, string> = {
  awaiting_approval: "text-amber-500 bg-amber-500/10 ring-amber-500/20",
  running: "text-primary bg-primary/10 ring-primary/20",
  completed: "text-emerald-500 bg-emerald-500/10 ring-emerald-500/20",
  failed: "text-destructive bg-destructive/10 ring-destructive/20",
  approved: "text-blue-500 bg-blue-500/10 ring-blue-500/20",
};

function StateChip({ state }: { state: string }) {
  const meta = STATE_META[state];
  const colors =
    STATE_COLORS[state] ??
    "text-muted-foreground bg-muted/60 ring-border/50";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${colors}`}
    >
      {meta?.icon}
      {meta?.label ?? state}
    </span>
  );
}

function RelativeDate({ iso }: { iso: string }) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return <span>Today</span>;
  if (days === 1) return <span>Yesterday</span>;
  if (days < 30) return <span>{days}d ago</span>;
  return (
    <span>
      {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    </span>
  );
}

export default async function AgentsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ws = await getActiveWorkspace(user.id);

  // Agents are a Solo+ feature — Free users see the upsell instead of the list.
  const tier = await getUserTier(user.id, ws?.workspaceId ?? null);
  if (!getEntitlements(tier).agents) {
    return <AgentsUpsell />;
  }

  const service = createServiceClient() as ReturnType<
    typeof createServiceClient
  > & { from(t: string): any };

  let agents: AgentRow[] = [];
  if (ws) {
    const { data } = await service
      .from("programs")
      .select(
        "id, name, description, agent_state, agent_saved_template, created_at"
      )
      .eq("workspace_id", ws.workspaceId)
      .eq("program_type", "agent")
      .order("created_at", { ascending: false });
    agents = (data ?? []) as AgentRow[];
  }

  const needsAttention = agents.filter(
    (a) => a.agent_state === "awaiting_approval"
  ).length;

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </span>
            <h1 className="text-xl font-bold tracking-tight">Agents</h1>
            {needsAttention > 0 && (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                {needsAttention} awaiting approval
              </span>
            )}
          </div>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            One-time agents handle a single, well-defined task. Describe it,
            approve the plan, run it once — then it steps aside.
          </p>
        </div>

        <Link
          href="/agents/new"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New agent
        </Link>
      </div>

      {/* ── Agent list ─────────────────────────────────── */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </span>
          <p className="mt-5 text-base font-semibold">No agents yet</p>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Got a big one-off task that isn&apos;t worth a workflow? Spin up an
            agent to plan and run it.
          </p>
          <Link
            href="/agents/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <Plus className="h-4 w-4" />
            Create your first agent
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {agents.map((agent) => {
            const state = agent.agent_state ?? "draft";
            const meta = STATE_META[state];
            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card/80 px-5 py-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                {/* Left: dot + name */}
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${meta?.dot ?? "bg-muted-foreground/40"}`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold group-hover:text-primary">
                        {agent.name}
                      </p>
                      {agent.agent_saved_template && (
                        <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Saved
                        </span>
                      )}
                    </div>
                    {agent.description && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {agent.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: state + date */}
                <div className="flex shrink-0 items-center gap-3">
                  <StateChip state={state} />
                  <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                    <Clock className="h-3 w-3" />
                    <RelativeDate iso={agent.created_at} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
