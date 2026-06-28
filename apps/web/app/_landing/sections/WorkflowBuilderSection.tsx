"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  CheckCircle2,
  Database,
  FileText,
  GitFork,
  Mail,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Eyebrow, Reveal, SectionShell, StatusPill } from "./shared";

type NodeState = "done" | "running" | "review" | "idle";

const NODES: {
  id: string;
  icon: React.ElementType;
  label: string;
  sub: string;
  x: number; // % of canvas width
  y: number; // % of canvas height
  state: NodeState;
}[] = [
  { id: "trigger", icon: Mail, label: "Gmail trigger", sub: "New message", x: 4, y: 8, state: "done" },
  { id: "ai", icon: Bot, label: "AI classify", sub: "Intent + entities", x: 4, y: 54, state: "done" },
  { id: "policy", icon: GitFork, label: "Policy check", sub: "Personal data?", x: 38, y: 31, state: "running" },
  { id: "approval", icon: ShieldCheck, label: "Approval gate", sub: "Review required", x: 38, y: 74, state: "review" },
  { id: "crm", icon: Database, label: "Sync to CRM", sub: "Update record", x: 72, y: 31, state: "idle" },
  { id: "evidence", icon: FileText, label: "Evidence", sub: "Store run record", x: 72, y: 74, state: "idle" },
];

// edges by node index pairs
const EDGES: [string, string][] = [
  ["trigger", "policy"],
  ["ai", "policy"],
  ["ai", "approval"],
  ["policy", "crm"],
  ["approval", "crm"],
  ["approval", "evidence"],
  ["crm", "evidence"],
];

const stateDot: Record<NodeState, string> = {
  done: "bg-[#34d399] shadow-[0_0_8px_rgba(52,211,153,0.8)]",
  running: "bg-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse",
  review: "bg-[#f5b14c] shadow-[0_0_8px_rgba(245,177,76,0.8)] animate-pulse",
  idle: "bg-white/25",
};

const stateRing: Record<NodeState, string> = {
  done: "border-[#34d399]/40",
  running: "border-[#38bdf8]/50",
  review: "border-[#f5b14c]/50",
  idle: "border-white/10",
};

function nodePos(id: string) {
  const n = NODES.find((x) => x.id === id)!;
  // center anchor in %; nodes are ~150px wide / 56px tall on a relative canvas
  return { cx: n.x + 11, cy: n.y + 6 };
}

const STEPS = [
  "Gmail trigger receives a message",
  "AI classifies the request",
  "Policy check identifies personal data",
  "Human approval gate pauses the workflow",
  "Approved output syncs to CRM",
  "Execution record is stored as evidence",
];

export function WorkflowBuilderSection() {
  const reduce = useReducedMotion();
  return (
    <SectionShell id="workflows" glow="cyan" className="bg-[#0a0c10] text-white">
      <div className="max-w-3xl">
        <Reveal>
          <Eyebrow tone="cyan" icon={<Workflow className="h-3.5 w-3.5" />}>
            Visual workflow builder
          </Eyebrow>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
            Design workflows visually.
            <br />
            <span className="text-white/45">Run them with structure.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-5 text-pretty text-base leading-7 text-white/55 sm:text-lg">
            Build agent-based programs from triggers, model calls, conditions,
            approvals, and connected services. Each workflow is understandable
            before it runs and reviewable after it executes.
          </p>
        </Reveal>
      </div>

      {/* Product UI: canvas + sidebar */}
      <Reveal delay={0.1}>
        <div className="mt-14 overflow-hidden rounded-2xl border border-white/10 bg-[#070809] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
          {/* window chrome */}
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f0563f]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f5b14c]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]/70" />
              <span className="ml-3 font-mono text-[11px] text-white/40">
                corelyx · support-triage.flow
              </span>
            </div>
            <StatusPill state="running">Validating</StatusPill>
          </div>

          <div className="grid lg:grid-cols-[1fr_280px]">
            {/* Canvas — pannable on mobile, full-width on desktop */}
            <div className="overflow-x-auto border-b border-white/10 lg:border-b-0 lg:border-r">
            <div className="relative h-[420px] min-w-[600px] overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] [background-size:22px_22px] lg:min-w-0">
              {/* connectors */}
              <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                <defs>
                  <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#f05a28" stopOpacity="0.45" />
                  </linearGradient>
                </defs>
                {EDGES.map(([a, b], i) => {
                  const p1 = nodePos(a);
                  const p2 = nodePos(b);
                  const d = `M ${p1.cx}% ${p1.cy}% C ${(p1.cx + p2.cx) / 2}% ${p1.cy}%, ${(p1.cx + p2.cx) / 2}% ${p2.cy}%, ${p2.cx}% ${p2.cy}%`;
                  return (
                    <motion.path
                      key={`${a}-${b}`}
                      d={d}
                      fill="none"
                      stroke="url(#edgeGrad)"
                      strokeWidth={1.5}
                      initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
                      whileInView={{ pathLength: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.1, delay: 0.2 + i * 0.12, ease: "easeInOut" }}
                    />
                  );
                })}
              </svg>

              {/* nodes */}
              {NODES.map((node, i) => {
                const Icon = node.icon;
                return (
                  <motion.div
                    key={node.id}
                    className={`absolute w-[150px] rounded-xl border ${stateRing[node.state]} bg-[#0d0f14]/95 p-2.5 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)] backdrop-blur-sm`}
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[#f05a28]">
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold leading-tight">{node.label}</p>
                        <p className="truncate font-mono text-[9px] text-white/40">{node.sub}</p>
                      </div>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stateDot[node.state]}`} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
            </div>

            {/* Config sidebar */}
            <div className="bg-[#08090d] p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-white/35">
                Node · Approval gate
              </p>
              <div className="mt-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#f5b14c]" />
                <span className="text-sm font-semibold">Review required</span>
              </div>
              <div className="mt-4 space-y-3 text-[12px]">
                {[
                  ["Reviewers", "Ops team"],
                  ["Trigger when", "Personal data present"],
                  ["On reject", "Halt + log"],
                  ["SLA", "4 hours"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <span className="text-white/40">{k}</span>
                    <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-white/70">
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-[#f5b14c]/25 bg-[#f5b14c]/[0.06] p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#ffd79a]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Gate active before CRM write
                </p>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Workflow steps */}
      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step} delay={0.05 * i}>
            <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
              <span className="font-mono text-xs text-[#f05a28]">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[13px] leading-snug text-white/65">{step}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}
