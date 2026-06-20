import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
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
import { cn } from "@/lib/utils";
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
  { label: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    icon: <CircleDashed className="h-3 w-3" />,
  },
  awaiting_approval: {
    label: "Awaiting approval",
    icon: <ShieldCheck className="h-3 w-3" />,
  },
  approved: {
    label: "Approved",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  running: {
    label: "Running",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "Failed",
    icon: <CircleX className="h-3 w-3" />,
  },
  discarded: {
    label: "Discarded",
    icon: <CircleDashed className="h-3 w-3" />,
  },
};

const STATE_COLORS: Record<string, string> = {
  awaiting_approval: "text-amber-500 bg-amber-500/10 ring-amber-500/20",
  running: "text-primary bg-primary/10 ring-primary/20",
  completed: "text-emerald-500 bg-emerald-500/10 ring-emerald-500/20",
  failed: "text-destructive bg-destructive/10 ring-destructive/20",
  approved: "text-blue-500 bg-blue-500/10 ring-blue-500/20",
};

// State-colored ring around each agent's animated swatch, so status reads at a
// glance even though the swatch gradient itself is the agent's identity.
const STATE_RING: Record<string, string> = {
  awaiting_approval: "ring-amber-500/40",
  running: "ring-primary/45",
  completed: "ring-emerald-500/40",
  failed: "ring-destructive/40",
  approved: "ring-blue-500/40",
};

const DEFAULT_RING = "ring-border/60";

// Per-agent gradient "fingerprint": two hues hashed from the id so every agent
// has a stable, unique swatch. Fed to CSS via --sw-h1 / --sw-h2.
function swatchStyle(id: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 35 + (Math.abs(hash >> 9) % 60)) % 360;
  return { "--sw-h1": String(h1), "--sw-h2": String(h2) } as React.CSSProperties;
}

const STATE_DOT: Record<string, string> = {
  awaiting_approval: "bg-amber-500",
  running: "bg-primary",
  completed: "bg-emerald-500",
  failed: "bg-destructive",
  approved: "bg-blue-500",
};

// Animated identity swatch (replaces a static icon). Gradient = the agent's
// fingerprint; the state-colored ring + corner dot carry status, and running
// spins faster with a pulsing dot.
function AgentSwatch({ id, state, size = "md" }: { id: string; state: string; size?: "sm" | "md" }) {
  const ring = STATE_RING[state] ?? DEFAULT_RING;
  const dims = size === "sm" ? "h-9 w-9" : "h-12 w-12";
  const dotSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  const dot = STATE_DOT[state] ?? "bg-muted-foreground/40";
  const fast = state === "running";
  const pulse = state === "running" || state === "awaiting_approval";
  return (
    <span className="relative inline-flex shrink-0" aria-hidden>
      {/* overflow-hidden clips the rotating gradient into a circle */}
      <span
        className={cn(
          "agent-swatch ring-2 transition-transform group-hover:scale-105",
          dims,
          ring,
          fast && "agent-swatch--fast"
        )}
        style={swatchStyle(id)}
      />
      {/* dot lives outside the clipped swatch so it isn't cut off */}
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 z-10 rounded-full border-2 border-background",
          dotSize,
          dot,
          pulse && "animate-pulse"
        )}
      />
    </span>
  );
}

// Compact list row for past/used agents — denser and more scannable than a card
// grid when there are many. Lives inside a single glass panel (dashboard style).
function AgentListRow({
  agent,
  scheduled,
}: {
  agent: AgentRow;
  scheduled: boolean;
}) {
  const state = agent.agent_state ?? "draft";
  return (
    <li>
      <Link
        href={`/agents/${agent.id}`}
        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5"
      >
        <AgentSwatch id={agent.id} state={state} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium group-hover:text-primary">{agent.name}</p>
            {agent.agent_saved_template && (
              <span className="hidden shrink-0 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
                Saved
              </span>
            )}
            {scheduled && (
              <span className="hidden shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                <Clock className="h-2.5 w-2.5" /> Scheduled
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {agent.description?.trim() || "No description"}
          </p>
        </div>
        <StateChip state={state} />
        <span className="hidden w-16 shrink-0 text-right text-[11px] text-muted-foreground md:inline">
          <RelativeDate iso={agent.created_at} />
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground" />
      </Link>
    </li>
  );
}

// Dashboard-style summary tile: colored icon chip, label, big black number.
function StatTile({
  label,
  value,
  detail,
  Icon,
  tone,
}: {
  label: string;
  value: number;
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
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-black tracking-tight text-foreground">{value}</p>
        <span className="pb-1 text-[11px] text-muted-foreground">{detail}</span>
      </div>
    </section>
  );
}

function StateChip({ state }: { state: string }) {
  const meta = STATE_META[state];
  const colors =
    STATE_COLORS[state] ?? "text-muted-foreground bg-muted/60 ring-border/50";
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

function AgentCard({
  agent,
  scheduled,
  hasQuestion,
}: {
  agent: AgentRow;
  scheduled: boolean;
  hasQuestion: boolean;
}) {
  const state = agent.agent_state ?? "draft";
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group flex flex-col rounded-2xl border glass-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <AgentSwatch id={agent.id} state={state} />
        <StateChip state={state} />
      </div>

      <p className="mt-3 truncate text-sm font-semibold group-hover:text-primary">
        {agent.name}
      </p>
      {agent.description ? (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {agent.description}
        </p>
      ) : (
        <p className="mt-1 text-xs italic text-muted-foreground/60">
          No description
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-3">
        {hasQuestion && (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-400">
            Needs answer
          </span>
        )}
        {agent.agent_saved_template && (
          <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Saved
          </span>
        )}
        {scheduled && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Clock className="h-2.5 w-2.5" /> Scheduled
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <RelativeDate iso={agent.created_at} />
        </span>
      </div>
    </Link>
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

  // Inbox signals: which agents have a paused question, and which are scheduled.
  const pendingQuestionIds = new Set<string>();
  const scheduledIds = new Set<string>();
  const agentIds = agents.map((a) => a.id);
  if (agentIds.length > 0) {
    const [{ data: qRows }, { data: trigRows }] = await Promise.all([
      service.from("approvals").select("context").eq("user_id", user.id).eq("status", "pending"),
      service.from("triggers").select("program_id, type, is_active").in("program_id", agentIds).eq("is_active", true),
    ]);
    const agentIdSet = new Set(agentIds);
    for (const r of (qRows ?? []) as Array<{ context: Record<string, unknown> | null }>) {
      const pid = r.context?.program_id;
      if (r.context?.kind === "question" && typeof pid === "string" && agentIdSet.has(pid)) {
        pendingQuestionIds.add(pid);
      }
    }
    for (const t of (trigRows ?? []) as Array<{ program_id: string; type: string }>) {
      if (t.type !== "manual") scheduledIds.add(t.program_id);
    }
  }

  // "Needs you" = waiting on plan approval or a paused question.
  const needsInput = agents.filter(
    (a) => a.agent_state === "awaiting_approval" || pendingQuestionIds.has(a.id)
  );
  const restAgents = agents.filter((a) => !needsInput.includes(a));
  const needsAttention = needsInput.length;
  const runningCount = agents.filter((a) => a.agent_state === "running").length;
  const completedCount = agents.filter((a) => a.agent_state === "completed").length;
  const draftCount = agents.filter((a) => (a.agent_state ?? "draft") === "draft").length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* ── Header (dashboard-style eyebrow + title) ───── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Agents</p>
          <div className="mt-1 flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight">Your agents</h1>
            {needsAttention > 0 && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-400">
                {needsAttention} need{needsAttention === 1 ? "s" : ""} you
              </span>
            )}
          </div>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            One-time agents handle a single, well-defined task. Describe it,
            approve the plan, run it once — then it steps aside.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/agents/knowledge"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background/50 px-3.5 text-sm font-semibold transition-colors hover:bg-accent"
          >
            <BookOpen className="h-4 w-4" />
            Knowledge
          </Link>
          <Link
            href="/agents/new"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New agent
          </Link>
        </div>
      </header>

      {/* ── Summary tiles (dashboard-style) ────────────── */}
      {agents.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Total agents"
            value={agents.length}
            detail={draftCount > 0 ? `${draftCount} draft${draftCount === 1 ? "" : "s"}` : "all set up"}
            Icon={Bot}
            tone="green"
          />
          <StatTile
            label="Running"
            value={runningCount}
            detail={runningCount > 0 ? "in progress" : "idle"}
            Icon={Activity}
            tone="blue"
          />
          <StatTile
            label="Needs you"
            value={needsAttention}
            detail={needsAttention > 0 ? "review now" : "all clear"}
            Icon={ShieldCheck}
            tone="amber"
          />
          <StatTile
            label="Completed"
            value={completedCount}
            detail={completedCount > 0 ? "wrapped up" : "none yet"}
            Icon={CheckCircle2}
            tone="violet"
          />
        </div>
      )}

      {/* ── Agent grid ─────────────────────────────────── */}
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
        <div className="space-y-8">
          {/* Needs your input */}
          {needsInput.length > 0 && (
            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">
                Needs your input
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {needsInput.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    scheduled={scheduledIds.has(agent.id)}
                    hasQuestion={pendingQuestionIds.has(agent.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Everything else — a compact list instead of more card rows */}
          {restAgents.length > 0 && (
            <section className="overflow-hidden rounded-2xl border glass-panel">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {needsInput.length > 0 ? "All agents" : "Agents"}
                </p>
                <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground ring-1 ring-border/50">
                  {restAgents.length}
                </span>
              </div>
              <ul className="divide-y divide-border/40">
                {restAgents.map((agent) => (
                  <AgentListRow
                    key={agent.id}
                    agent={agent}
                    scheduled={scheduledIds.has(agent.id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
