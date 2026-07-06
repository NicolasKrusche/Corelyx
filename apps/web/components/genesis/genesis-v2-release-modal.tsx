"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  MarkerType,
  type Node as ReactFlowNode,
  type Edge as ReactFlowEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Sparkles, Radar, MessagesSquare, GitPullRequestArrow, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { TriggerNode } from "@/components/nodes/TriggerNode";
import { AgentNode } from "@/components/nodes/AgentNode";
import { StepNode } from "@/components/nodes/StepNode";
import { ConnectionNode } from "@/components/nodes/ConnectionNode";
import { DataFlowEdge } from "@/components/edges/DataFlowEdge";

const NODE_TYPES = { trigger: TriggerNode, agent: AgentNode, step: StepNode, connection: ConnectionNode };
const EDGE_TYPES = { data_flow: DataFlowEdge };

// ─── Real-node preview canvas ──────────────────────────────────────────────────
// Renders the actual editor node components (via a non-interactive React Flow),
// so the animation previews are 1:1 with what users see in the workflow editor.

type PreviewNode = {
  id: string;
  type: "trigger" | "connection" | "step" | "agent";
  x: number;
  className?: string;
  genesisQuestion?: string;
  label: string;
  description: string;
  connection?: string | null;
  config: Record<string, unknown>;
};

function toRf(node: PreviewNode): ReactFlowNode {
  return {
    id: node.id,
    type: node.type,
    position: { x: node.x, y: 0 },
    draggable: false,
    selectable: false,
    connectable: false,
    ...(node.className ? { className: node.className } : {}),
    data: {
      label: node.label,
      description: node.description,
      connection: node.connection ?? null,
      status: "idle",
      config: node.config,
      validationState: "valid",
      errors: [],
      warnings: [],
      genesisQuestion: node.genesisQuestion ?? null,
    },
  };
}

function FlowPreview({ nodes }: { nodes: PreviewNode[] }) {
  const rfNodes = nodes.map(toRf);
  const rfEdges: ReactFlowEdge[] = nodes.slice(1).map((n, i) => ({
    id: `e${i}`,
    source: nodes[i]!.id,
    target: n.id,
    type: "data_flow",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { condition: null, data_mapping: null, validationErrors: [] },
  }));

  return (
    <div className="h-[210px] w-full overflow-hidden rounded-xl border border-border bg-background/40">
      <ReactFlowProvider>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} className="opacity-40" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

// ─── Scenes (real nodes) ───────────────────────────────────────────────────────

const QUESTION_SCENE: PreviewNode[] = [
  { id: "t", type: "trigger", x: 0, label: "Weekday 8am", description: "Fires weekdays at 8am UTC.", config: { trigger_type: "cron", expression: "0 8 * * 1-5", timezone: "UTC" } },
  { id: "g", type: "connection", x: 320, label: "Fetch unread emails", description: "Lists unread Gmail inbox emails.", connection: "My Gmail", config: { provider: "gmail", scope_access: "read", operation: "list_emails" } },
  { id: "s", type: "connection", x: 640, label: "Post to Slack", description: "Sends the summary to the channel.", connection: "My Slack", config: { provider: "slack", scope_access: "write", operation: "send_message" }, genesisQuestion: "Which channel should the summary go to? I picked #revenue, but you have a few." },
];

const EDIT_SCENE: PreviewNode[] = [
  { id: "t", type: "trigger", x: 0, className: "genesis-preview-updated", label: "Weekday 7am", description: "Changed from 8am to 7am.", config: { trigger_type: "cron", expression: "0 7 * * 1-5", timezone: "UTC" } },
  { id: "n", type: "connection", x: 320, className: "genesis-preview-added", label: "Save to Notion", description: "Also save each summary to Notion.", connection: "My Notion", config: { provider: "notion", scope_access: "write", operation: "create_database_entry" } },
  { id: "f", type: "step", x: 640, className: "genesis-preview-removed", label: "Old filter", description: "No longer needed.", config: { logic_type: "filter", condition: "len(data['n2'].get('emails',[]))>0" } },
];

// ─── Slides ────────────────────────────────────────────────────────────────────

type Slide = { kicker: string; title: string; body: React.ReactNode };

const SLIDES: Slide[] = [
  {
    kicker: "Genesis · Version 2",
    title: "Genesis just got a lot smarter",
    body: (
      <div className="grid gap-2.5 sm:grid-cols-3">
        {[
          { icon: Radar, label: "Knows your accounts", text: "Reads your real channels, labels, and databases while it builds." },
          { icon: MessagesSquare, label: "Asks when unsure", text: "Pins a question to the node instead of guessing." },
          { icon: GitPullRequestArrow, label: "Edits you can watch", text: "Surgical changes, animated — never a silent swap." },
        ].map((f) => (
          <div key={f.label} className="rounded-xl border border-border bg-background/50 p-3">
            <f.icon className="h-4 w-4 text-primary" />
            <p className="mt-2 text-[12px] font-semibold text-foreground">{f.label}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    kicker: "It asks first",
    title: "No more guessing which channel",
    body: (
      <div className="space-y-3">
        <FlowPreview nodes={QUESTION_SCENE} />
        <p className="text-center text-[11px] text-muted-foreground">
          When a node rests on a real guess, Genesis pins a question to it — the workflow still finishes and saves.
        </p>
      </div>
    ),
  },
  {
    kicker: "Surgical edits",
    title: "Watch every change happen",
    body: (
      <div className="space-y-3">
        <FlowPreview nodes={EDIT_SCENE} />
        <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-500"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Added fades in</span>
          <span className="inline-flex items-center gap-1.5 text-amber-500"><span className="h-2 w-2 rounded-full bg-amber-500" /> Changed pulses</span>
          <span className="inline-flex items-center gap-1.5 text-rose-500"><span className="h-2 w-2 rounded-full bg-rose-500" /> Removed strikes through</span>
        </div>
      </div>
    ),
  },
  {
    kicker: "Private by design",
    title: "Grounded in your data, without exposing it",
    body: (
      <div className="space-y-4">
        <div className="mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-background/50 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Genesis reads your account structure to build accurately, but your channel names, labels, and
            database titles are pseudonymized before anything reaches the model — it works with placeholders,
            and your real names are substituted back only on your side.
          </p>
        </div>
        <p className="text-center text-[12px] font-medium text-foreground">
          Available now on the <span className="text-primary">Scale</span> plan.
        </p>
      </div>
    ),
  },
];

// ─── The slideshow modal ───────────────────────────────────────────────────────

export function GenesisV2ReleaseModal({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const last = SLIDES.length - 1;
  const slide = SLIDES[index]!;

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, last)), [last]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Accent header */}
        <div className="relative overflow-hidden border-b border-border/60 px-6 pb-4 pt-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "radial-gradient(ellipse 60% 120% at 15% 0%, hsl(var(--primary) / 0.15), transparent 70%)" }}
          />
          <div className="relative flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
              <Sparkles className="h-3 w-3" />
              New in Genesis
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              Skip
            </button>
          </div>
          <p className="relative mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{slide.kicker}</p>
          <h2 className="relative mt-1 text-xl font-black tracking-tight text-foreground">{slide.title}</h2>
        </div>

        {/* Slide body — fixed min height so the card doesn't jump between slides */}
        <div className="min-h-[248px] px-6 py-5">
          <div key={index} className="genesis-slide-in">
            {slide.body}
          </div>
        </div>

        {/* Footer: dots + nav */}
        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3.5">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Back
              </button>
            )}
            {index < last ? (
              <button
                type="button"
                onClick={next}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Got it, let&apos;s go →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
