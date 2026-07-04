"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  CircleX,
  Clock,
  FileText,
  GitFork,
  LayoutGrid,
  Loader2,
  Plug,
  Plus,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CineEyebrow, CINE_TITLE } from "@/components/cinematic";
import {
  buildFlowClusters,
  type Rel,
  type FlowNode,
  type FlowEdge,
  type AgentVM,
  type AgentRelationVM,
  type KnowledgeSourceVM,
} from "./flow-graph";

// Re-export the serializable view-models so server callers can import them here.
export type { AgentVM, AgentRelationVM, KnowledgeSourceVM } from "./flow-graph";

/** A pending critical-signal flag shown in the "Flagged for review" inbox. */
export type FlagVM = {
  id: string;
  subject: string | null;
  snippet: string | null;
  reason: string | null;
  categories: string[];
  origin: "auto" | "agent";
  sourceProvider: string | null;
  createdAt: string;
};

const STATE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  draft: { label: "Draft", icon: <CircleDashed className="h-3 w-3" /> },
  awaiting_approval: { label: "Awaiting approval", icon: <ShieldCheck className="h-3 w-3" /> },
  approved: { label: "Approved", icon: <CheckCircle2 className="h-3 w-3" /> },
  running: { label: "Running", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { label: "Completed", icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { label: "Failed", icon: <CircleX className="h-3 w-3" /> },
  discarded: { label: "Discarded", icon: <CircleDashed className="h-3 w-3" /> },
};

const STATE_COLORS: Record<string, string> = {
  awaiting_approval: "text-amber-500 bg-amber-500/10 ring-amber-500/20",
  running: "text-primary bg-primary/10 ring-primary/20",
  completed: "text-emerald-500 bg-emerald-500/10 ring-emerald-500/20",
  failed: "text-destructive bg-destructive/10 ring-destructive/20",
  approved: "text-blue-500 bg-blue-500/10 ring-blue-500/20",
};

const STATE_RING: Record<string, string> = {
  awaiting_approval: "ring-amber-500/40",
  running: "ring-primary/45",
  completed: "ring-emerald-500/40",
  failed: "ring-destructive/40",
  approved: "ring-blue-500/40",
};

const DEFAULT_RING = "ring-border/60";

const STATE_DOT: Record<string, string> = {
  awaiting_approval: "bg-amber-500",
  running: "bg-primary",
  completed: "bg-emerald-500",
  failed: "bg-destructive",
  approved: "bg-blue-500",
};

// Per-agent gradient "fingerprint": two hues hashed from the id.
function swatchStyle(id: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 35 + (Math.abs(hash >> 9) % 60)) % 360;
  return { "--sw-h1": String(h1), "--sw-h2": String(h2) } as React.CSSProperties;
}

function AgentSwatch({ id, state, size = "md" }: { id: string; state: string; size?: "sm" | "md" }) {
  const ring = STATE_RING[state] ?? DEFAULT_RING;
  const dims = size === "sm" ? "h-9 w-9" : "h-12 w-12";
  const dotSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  const dot = STATE_DOT[state] ?? "bg-muted-foreground/40";
  const fast = state === "running";
  const pulse = state === "running" || state === "awaiting_approval";
  return (
    <span className="relative inline-flex shrink-0" aria-hidden>
      <span
        className={cn(
          "agent-swatch ring-2 transition-transform group-hover:scale-105",
          dims,
          ring,
          fast && "agent-swatch--fast"
        )}
        style={swatchStyle(id)}
      />
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

function StateChip({ state }: { state: string }) {
  const meta = STATE_META[state];
  const colors = STATE_COLORS[state] ?? "text-muted-foreground bg-muted/60 ring-border/50";
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
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return <span>Today</span>;
  if (days === 1) return <span>Yesterday</span>;
  if (days < 30) return <span>{days}d ago</span>;
  return <span>{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>;
}

// ── Compact card used inside the kanban columns ──
function CompactAgentCard({ agent }: { agent: AgentVM }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group flex items-start gap-3 rounded-xl border glass-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <AgentSwatch id={agent.id} state={agent.state} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold group-hover:text-primary">{agent.name}</p>
          {agent.hasQuestion && (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 shadow-[0_0_10px_-2px_rgba(245,158,11,0.6)] ring-1 ring-amber-500/25 dark:text-amber-400">
              Needs answer
            </span>
          )}
          {agent.state === "draft" && agent.spawnedFrom && (
            <span className="shrink-0 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-600 ring-1 ring-violet-500/25 dark:text-violet-400">
              Spawned
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {agent.description?.trim() || "No description"}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground/80">
          {agent.scheduled && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Scheduled
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            <RelativeDate iso={agent.createdAt} />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Kanban column ──
type ColumnTone = "amber" | "red" | "blue" | "emerald";

const COLUMN_TONE: Record<ColumnTone, { dot: string; text: string; pill: string; line: string }> = {
  amber: {
    dot: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]",
    text: "text-amber-600 dark:text-amber-400",
    pill: "bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-400",
    line: "via-amber-500/50",
  },
  red: {
    dot: "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.8)]",
    text: "text-destructive",
    pill: "bg-destructive/10 text-destructive ring-destructive/25",
    line: "via-red-500/50",
  },
  blue: {
    dot: "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]",
    text: "text-primary",
    pill: "bg-primary/10 text-primary ring-primary/25",
    line: "via-[hsl(var(--primary)/0.5)]",
  },
  emerald: {
    dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]",
    text: "text-emerald-600 dark:text-emerald-400",
    pill: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400",
    line: "via-emerald-500/50",
  },
};

function KanbanColumn({
  title,
  tone,
  agents,
  emphasized,
  scrollCap,
}: {
  title: string;
  tone: ColumnTone;
  agents: AgentVM[];
  emphasized?: boolean;
  scrollCap?: boolean;
}) {
  const t = COLUMN_TONE[tone];
  return (
    <section
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border glass-panel",
        emphasized && agents.length > 0 && "ring-1",
        emphasized && agents.length > 0 && tone === "amber" && "ring-amber-500/20",
        emphasized && agents.length > 0 && tone === "red" && "ring-destructive/20"
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent", t.line)} />
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", t.dot)} />
          <p className={cn("font-mono text-[11px] font-semibold uppercase tracking-wider", t.text)}>{title}</p>
        </div>
        <span
          className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", t.pill)}
        >
          {agents.length}
        </span>
      </div>
      <div
        className={cn(
          "space-y-2 p-2.5",
          scrollCap && agents.length > 4 && "max-h-[28rem] overflow-y-auto"
        )}
      >
        {agents.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground/60">Nothing here</p>
        ) : (
          agents.map((a) => <CompactAgentCard key={a.id} agent={a} />)
        )}
      </div>
    </section>
  );
}

// ── Thin summary strip (replaces the four big stat cards) ──
function SummaryStrip({
  total,
  running,
  needs,
  failed,
  completed,
}: {
  total: number;
  running: number;
  needs: number;
  failed: number;
  completed: number;
}) {
  const items: Array<{ label: string; value: number; Icon: typeof Activity; tone: string }> = [
    { label: "Total", value: total, Icon: Bot, tone: "text-foreground" },
    { label: "Running", value: running, Icon: Activity, tone: "text-primary" },
    { label: "Needs you", value: needs, Icon: ShieldCheck, tone: "text-amber-500" },
    { label: "Failed", value: failed, Icon: AlertTriangle, tone: "text-destructive" },
    { label: "Completed", value: completed, Icon: CheckCircle2, tone: "text-emerald-500" },
  ];
  return (
    <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 overflow-hidden rounded-2xl border glass-panel px-5 py-3">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary)/0.35)] to-transparent" />
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <it.Icon className={cn("h-4 w-4", it.tone)} />
          <span className="text-lg font-black tracking-tight tabular-nums">{it.value}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  FLOW VIEW — layered DAG of agents referencing each other
// ════════════════════════════════════════════════════════════════════

// Relationship encoding: color + distinct dash, so it never relies on color alone.
const REL: Record<Rel, { color: string; dash?: string; label: string; bi?: boolean }> = {
  spawns: { color: "#a78bfa", label: "spawns" },
  reads: { color: "#2dd4bf", dash: "5 5", label: "reads source" },
  feeds: { color: "#94a3b8", label: "feeds into" },
  cross: { color: "#fb7185", dash: "2 4", label: "cross-check", bi: true },
};

const NODE_W = 168;
const NODE_H = 58;
const COL_GAP = 66;
const ROW_GAP = 18;
const PAD = 18;

function nodeX(col: number) {
  return PAD + col * (NODE_W + COL_GAP);
}
function nodeY(row: number) {
  return PAD + row * (NODE_H + ROW_GAP);
}

// Forward adjacency; cross-links count both ways for blast-radius / blocking.
function buildAdjacency(edges: FlowEdge[]) {
  const adj = new Map<string, string[]>();
  const push = (a: string, b: string) => {
    const arr = adj.get(a) ?? [];
    arr.push(b);
    adj.set(a, arr);
  };
  for (const e of edges) {
    push(e.from, e.to);
    if (REL[e.rel].bi) push(e.to, e.from);
  }
  return adj;
}

function reachableFrom(starts: string[], adj: Map<string, string[]>) {
  const seen = new Set<string>();
  const stack = [...starts];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!seen.has(nxt)) {
        seen.add(nxt);
        stack.push(nxt);
      }
    }
  }
  return seen;
}

function edgePath(s: FlowNode, t: FlowNode) {
  const sx = nodeX(s.col);
  const sy = nodeY(s.row);
  const tx = nodeX(t.col);
  const ty = nodeY(t.row);
  // Peer link (same column, e.g. cross-check): bow out to the right.
  if (Math.abs(sx - tx) < 4) {
    const x1 = sx + NODE_W;
    const y1 = sy + NODE_H / 2;
    const x2 = tx + NODE_W;
    const y2 = ty + NODE_H / 2;
    const mx = Math.max(x1, x2) + 48;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  }
  const x1 = sx + NODE_W;
  const y1 = sy + NODE_H / 2;
  const x2 = tx;
  const y2 = ty + NODE_H / 2;
  const dx = Math.max(36, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function FlowNodeCard({
  n,
  dim,
  blocked,
  onHover,
}: {
  n: FlowNode;
  dim: boolean;
  blocked: boolean;
  onHover: (id: string | null) => void;
}) {
  const failed = n.state === "failed";
  const ring = failed
    ? "ring-destructive/60"
    : blocked
      ? "ring-destructive/30"
      : STATE_RING[n.state] ?? DEFAULT_RING;

  const inner = (
    <>
      {n.kind === "orchestrator" ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-400 ring-2 ring-violet-500/40">
          <GitFork className="h-4 w-4" />
        </span>
      ) : n.kind === "source" ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-500/15 text-teal-400 ring-2 ring-teal-500/40">
          <FileText className="h-4 w-4" />
        </span>
      ) : n.kind === "connector" ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-sky-400 ring-2 ring-sky-500/40">
          <Plug className="h-4 w-4" />
        </span>
      ) : (
        <AgentSwatch id={n.id} state={n.state} size="sm" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight">{n.label}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
          {blocked ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-2.5 w-2.5" /> blocked
            </span>
          ) : (
            n.sub ?? STATE_META[n.state]?.label ?? n.state
          )}
        </p>
      </div>
    </>
  );

  const className = cn(
    "absolute flex items-center gap-2.5 rounded-xl border glass-card px-3 ring-2 transition-all duration-200",
    ring,
    dim && "opacity-25",
    blocked && !dim && "opacity-60 [border-style:dashed] border-destructive/40",
    n.href && "hover:z-20 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
  );
  const style: React.CSSProperties = {
    left: nodeX(n.col),
    top: nodeY(n.row),
    width: NODE_W,
    height: NODE_H,
  };

  if (n.href) {
    return (
      <Link
        href={n.href}
        className={cn(className, "group")}
        style={style}
        onMouseEnter={() => onHover(n.id)}
        onMouseLeave={() => onHover(null)}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div
      className={className}
      style={style}
      onMouseEnter={() => onHover(n.id)}
      onMouseLeave={() => onHover(null)}
    >
      {inner}
    </div>
  );
}

function FlowCluster({
  title,
  badge,
  nodes,
  edges,
}: {
  title: string;
  badge?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const adj = useMemo(() => buildAdjacency(edges), [edges]);

  // Anything downstream of a failed node is blocked (independent of hover).
  const blocked = useMemo(() => {
    const failed = nodes.filter((n) => n.state === "failed").map((n) => n.id);
    return reachableFrom(failed, adj);
  }, [nodes, adj]);

  // Hover blast-radius: the node plus everything it reaches.
  const active = useMemo(() => {
    if (!hovered) return null;
    const r = reachableFrom([hovered], adj);
    r.add(hovered);
    return r;
  }, [hovered, adj]);

  const width = PAD * 2 + Math.max(0, ...nodes.map((n) => nodeX(n.col) + NODE_W));
  const height = PAD * 2 + Math.max(0, ...nodes.map((n) => nodeY(n.row) + NODE_H)) - PAD;

  return (
    <div className="overflow-hidden rounded-2xl border glass-panel">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5">
        <p className="truncate font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          {title}
        </p>
        {badge && (
          <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-500 ring-1 ring-violet-500/25">
            {badge}
          </span>
        )}
      </div>
      <div className="overflow-x-auto p-2">
        <div className="relative" style={{ width, height }}>
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={width}
            height={height}
          >
            <defs>
              {(Object.keys(REL) as Rel[]).map((k) => (
                <marker
                  key={k}
                  id={`ah-${k}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M0 0 L10 5 L0 10 z" fill={REL[k].color} />
                </marker>
              ))}
            </defs>
            {edges.map((e, i) => {
              const s = byId.get(e.from);
              const t = byId.get(e.to);
              if (!s || !t) return null;
              const meta = REL[e.rel];
              const isActive =
                !active || (active.has(e.from) && active.has(e.to));
              return (
                <path
                  key={i}
                  d={edgePath(s, t)}
                  fill="none"
                  stroke={meta.color}
                  strokeWidth={1.6}
                  strokeDasharray={meta.dash}
                  markerEnd={`url(#ah-${e.rel})`}
                  markerStart={meta.bi ? `url(#ah-${e.rel})` : undefined}
                  opacity={isActive ? 0.85 : 0.12}
                  className="transition-opacity duration-200"
                />
              );
            })}
          </svg>
          {nodes.map((n) => (
            <FlowNodeCard
              key={n.id}
              n={n}
              dim={!!active && !active.has(n.id)}
              blocked={blocked.has(n.id)}
              onHover={setHovered}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FlowLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border glass-panel px-4 py-3 text-[11px]">
      <span className="font-mono font-semibold uppercase tracking-wider text-muted-foreground/70">
        Reference types
      </span>
      {(Object.keys(REL) as Rel[]).map((k) => (
        <span key={k} className="flex items-center gap-1.5 text-muted-foreground">
          <svg width="26" height="8" className="overflow-visible">
            <line
              x1="0"
              y1="4"
              x2="26"
              y2="4"
              stroke={REL[k].color}
              strokeWidth="1.8"
              strokeDasharray={REL[k].dash}
              markerEnd={`url(#legend-${k})`}
            />
            <defs>
              <marker
                id={`legend-${k}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0 0 L10 5 L0 10 z" fill={REL[k].color} />
              </marker>
            </defs>
          </svg>
          {REL[k].label}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
        failed blocks everything downstream
      </span>
    </div>
  );
}

// The representative example: one workflow that contains all four structures
// at once, with a failed node visibly stalling its downstream chain.
function exampleCluster(): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [
    { id: "ex-orch", label: "Orchestrator", sub: "running", state: "running", kind: "orchestrator", col: 0, row: 1 },
    { id: "ex-src", label: "Source list", sub: "shared input", state: "completed", kind: "source", col: 0, row: 3 },
    { id: "ex-a", label: "Scrape A", sub: "done", state: "completed", kind: "agent", col: 1, row: 0 },
    { id: "ex-b", label: "Scrape B", sub: "failed", state: "failed", kind: "agent", col: 1, row: 1 },
    { id: "ex-c", label: "Scrape C", sub: "running", state: "running", kind: "agent", col: 1, row: 2 },
    { id: "ex-norm", label: "Normalize", state: "completed", kind: "agent", col: 2, row: 1 },
    { id: "ex-analyze", label: "Analyze pricing", sub: "running", state: "running", kind: "agent", col: 2, row: 2 },
    { id: "ex-draft", label: "Draft", state: "completed", kind: "agent", col: 3, row: 0 },
    { id: "ex-fact", label: "Fact-check", state: "completed", kind: "agent", col: 3, row: 1 },
    { id: "ex-charts", label: "Charts", sub: "running", state: "running", kind: "agent", col: 3, row: 2 },
    { id: "ex-report", label: "Report", state: "completed", kind: "agent", col: 4, row: 0 },
  ];
  const edges: FlowEdge[] = [
    { from: "ex-orch", to: "ex-a", rel: "spawns" },
    { from: "ex-orch", to: "ex-b", rel: "spawns" },
    { from: "ex-orch", to: "ex-c", rel: "spawns" },
    { from: "ex-src", to: "ex-a", rel: "reads" },
    { from: "ex-src", to: "ex-b", rel: "reads" },
    { from: "ex-src", to: "ex-c", rel: "reads" },
    { from: "ex-a", to: "ex-norm", rel: "feeds" },
    { from: "ex-b", to: "ex-norm", rel: "feeds" },
    { from: "ex-c", to: "ex-analyze", rel: "feeds" },
    { from: "ex-norm", to: "ex-draft", rel: "feeds" },
    { from: "ex-draft", to: "ex-fact", rel: "cross" },
    { from: "ex-draft", to: "ex-report", rel: "feeds" },
    { from: "ex-analyze", to: "ex-charts", rel: "feeds" },
  ];
  return { nodes, edges };
}

function FlowView({
  agents,
  relations,
  knowledgeSources,
}: {
  agents: AgentVM[];
  relations: AgentRelationVM[];
  knowledgeSources: KnowledgeSourceVM[];
}) {
  const clusters = useMemo(
    () => buildFlowClusters(agents, relations, knowledgeSources),
    [agents, relations, knowledgeSources]
  );

  const linkedAgentIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of clusters) for (const n of c.nodes) if (n.kind === "agent") s.add(n.id);
    return s;
  }, [clusters]);
  const unlinkedCount = agents.filter((a) => !linkedAgentIds.has(a.id)).length;

  const example = useMemo(() => exampleCluster(), []);

  return (
    <div className="space-y-4">
      <FlowLegend />

      {clusters.length > 0 ? (
        <div className="space-y-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Your linked agents
          </p>
          {clusters.map((c, i) => (
            <FlowCluster key={`${c.title}-${i}`} title={c.title} nodes={c.nodes} edges={c.edges} />
          ))}
          {unlinkedCount > 0 && (
            <p className="text-xs text-muted-foreground/70">
              + {unlinkedCount} agent{unlinkedCount === 1 ? "" : "s"} not part of any chain.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          None of your agents reference each other yet. When an agent spawns another,
          reads a source, cross-checks a peer, or re-runs from one, those links show
          up here. The example below shows how every reference type reads at a glance.
        </div>
      )}

      <FlowCluster
        title="Example workflow — all four reference types"
        badge="Example"
        nodes={example.nodes}
        edges={example.edges}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  Flagged-for-review inbox (critical-signal safety net)
// ════════════════════════════════════════════════════════════════════

function CategoryLabel(cat: string) {
  return cat.replace(/_/g, " ");
}

function FlaggedInbox({ flags }: { flags: FlagVM[] }) {
  const router = useRouter();
  const [items, setItems] = useState(flags);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setItems(flags), [flags]);

  async function resolve(id: string, status: "kept" | "dismissed") {
    if (busy) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/agents/flags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((f) => f.id !== id));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-destructive/30 bg-destructive/[0.04] shadow-[0_0_40px_-18px_rgba(239,68,68,0.45)] ring-1 ring-destructive/15 backdrop-blur-sm">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
      <div className="flex items-center gap-2 border-b border-destructive/20 px-5 py-3">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <p className="text-sm font-semibold text-destructive">Flagged for review</p>
        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive ring-1 ring-destructive/25">
          {items.length}
        </span>
        <p className="ml-2 hidden text-xs text-muted-foreground sm:block">
          Possible safety-critical messages an agent was about to triage away. Review before they&apos;re lost.
        </p>
      </div>
      <ul className="divide-y divide-destructive/10">
        {items.map((f) => (
          <li key={f.id} className="px-5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-semibold">{f.subject || "Flagged message"}</p>
                  <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-border/50">
                    {f.origin === "agent" ? "Agent" : "Auto-screen"}
                  </span>
                  {f.sourceProvider && (
                    <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                      {f.sourceProvider}
                    </span>
                  )}
                  {f.categories.map((c) => (
                    <span
                      key={c}
                      className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold capitalize text-destructive ring-1 ring-destructive/20"
                    >
                      {CategoryLabel(c)}
                    </span>
                  ))}
                </div>
                {f.reason && <p className="mt-1 text-xs text-muted-foreground">{f.reason}</p>}
                {f.snippet && (
                  <p className="mt-1.5 line-clamp-3 rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5 text-xs italic text-muted-foreground">
                    “{f.snippet}”
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  type="button"
                  disabled={busy === f.id}
                  onClick={() => void resolve(f.id, "kept")}
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  Keep &amp; review
                </button>
                <button
                  type="button"
                  disabled={busy === f.id}
                  onClick={() => void resolve(f.id, "dismissed")}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
//  ROOT — header, view toggle, board/flow switch
// ════════════════════════════════════════════════════════════════════

export function AgentsView({
  agents,
  relations,
  knowledgeSources,
  flags,
}: {
  agents: AgentVM[];
  relations: AgentRelationVM[];
  knowledgeSources: KnowledgeSourceVM[];
  flags: FlagVM[];
}) {
  const [view, setView] = useState<"board" | "flow">("board");

  // Remember the last chosen view across visits.
  useEffect(() => {
    const saved = localStorage.getItem("agents-view");
    if (saved === "board" || saved === "flow") setView(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("agents-view", view);
  }, [view]);

  // "Needs you" = awaiting plan approval, a paused question, or a freshly
  // spawned child (a draft the user must review/approve before it can run).
  const isNeeds = (a: AgentVM) =>
    a.state === "awaiting_approval" ||
    a.hasQuestion ||
    (a.state === "draft" && !!a.spawnedFrom);
  const needs = agents.filter(isNeeds);
  const rest = agents.filter((a) => !isNeeds(a));
  const failed = rest.filter((a) => a.state === "failed");
  const running = rest.filter((a) => a.state === "running");
  const completed = rest.filter((a) => a.state === "completed");
  const other = rest.filter(
    (a) => !["failed", "running", "completed"].includes(a.state)
  );

  const needsAttention = needs.length;

  return (
    <div className="relative mx-auto w-full max-w-6xl space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CineEyebrow>Agents</CineEyebrow>
          <div className="mt-2 flex items-center gap-2.5">
            <h1 className={cn("text-3xl", CINE_TITLE)}>Your agents</h1>
            {needsAttention > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 shadow-[0_0_14px_-4px_rgba(245,158,11,0.7)] ring-1 ring-amber-500/25 dark:text-amber-400">
                <span className="cx-blink h-1 w-1 rounded-full bg-amber-500" />
                {needsAttention} need{needsAttention === 1 ? "s" : ""} you
              </span>
            )}
            {flags.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive shadow-[0_0_14px_-4px_rgba(239,68,68,0.7)] ring-1 ring-destructive/25">
                <AlertTriangle className="h-3 w-3" />
                {flags.length} flagged
              </span>
            )}
          </div>
          <p className="mt-1.5 max-w-lg font-mono text-xs text-muted-foreground">
            One-time agents handle a single, well-defined task. Describe it, approve the
            plan, run it once — then it steps aside.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/agents/knowledge"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3.5 text-sm font-semibold backdrop-blur-md transition-colors hover:bg-accent"
          >
            <BookOpen className="h-4 w-4" />
            Knowledge
          </Link>
          <Link
            href="/agents/new"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_0_28px_-8px_hsl(var(--primary)/0.7)] transition-all hover:-translate-y-0.5 hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New agent
          </Link>
        </div>
      </header>

      {/* Safety net surfaces above everything — it's the most urgent thing here. */}
      <FlaggedInbox flags={flags} />

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center backdrop-blur-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 shadow-[0_0_32px_-8px_hsl(var(--primary)/0.6)] ring-1 ring-primary/25">
            <Sparkles className="h-7 w-7 text-primary" />
          </span>
          <p className="mt-5 text-base font-semibold">No agents yet</p>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Got a big one-off task that isn&apos;t worth a workflow? Spin up an agent to
            plan and run it.
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
        <>
          {/* Summary strip + view toggle */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SummaryStrip
              total={agents.length}
              running={running.length}
              needs={needs.length}
              failed={failed.length}
              completed={completed.length}
            />
            <div className="inline-flex shrink-0 self-start rounded-xl border border-border/70 bg-card/60 p-0.5 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setView("board")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  view === "board"
                    ? "bg-primary text-primary-foreground shadow-[0_0_20px_-6px_hsl(var(--primary)/0.7)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                Board
              </button>
              <button
                type="button"
                onClick={() => setView("flow")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  view === "flow"
                    ? "bg-primary text-primary-foreground shadow-[0_0_20px_-6px_hsl(var(--primary)/0.7)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Workflow className="h-4 w-4" />
                Flow
              </button>
            </div>
          </div>

          {view === "board" ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KanbanColumn title="Needs you" tone="amber" agents={needs} emphasized />
                <KanbanColumn title="Failed" tone="red" agents={failed} emphasized />
                <KanbanColumn title="Running" tone="blue" agents={running} />
                <KanbanColumn title="Completed" tone="emerald" agents={completed} scrollCap />
              </div>

              {other.length > 0 && (
                <section className="overflow-hidden rounded-2xl border glass-panel">
                  <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Drafts &amp; idle
                    </p>
                    <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground ring-1 ring-border/50">
                      {other.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-border/40">
                    {other.map((agent) => (
                      <li key={agent.id}>
                        <Link
                          href={`/agents/${agent.id}`}
                          className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5"
                        >
                          <AgentSwatch id={agent.id} state={agent.state} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium group-hover:text-primary">
                              {agent.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {agent.description?.trim() || "No description"}
                            </p>
                          </div>
                          <StateChip state={agent.state} />
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <FlowView agents={agents} relations={relations} knowledgeSources={knowledgeSources} />
          )}
        </>
      )}
    </div>
  );
}
