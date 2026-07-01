"use client";

import React from "react";
import {
  Bot,
  Database,
  FileCheck2,
  FileText,
  GitFork,
  Mail,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* The canonical Corelyx workflow graph, reused across scenes so the same
   system visibly evolves: forming → governed → paused for approval → final.
   Coordinates live in a 0..100 viewBox; nodes are placed at the same
   coordinates so SVG edges and DOM nodes always line up. */

type NodeId = "trigger" | "ai" | "policy" | "approval" | "action" | "log" | "export";

const NODES: {
  id: NodeId;
  icon: LucideIcon;
  label: string;
  sub: string;
  cx: number;
  cy: number;
}[] = [
  { id: "trigger", icon: Mail, label: "Trigger", sub: "inbound email", cx: 10, cy: 48 },
  { id: "ai", icon: Bot, label: "AI step", sub: "classify", cx: 30, cy: 22 },
  { id: "policy", icon: GitFork, label: "Policy check", sub: "personal data", cx: 30, cy: 74 },
  { id: "approval", icon: ShieldCheck, label: "Approval gate", sub: "human review", cx: 52, cy: 48 },
  { id: "action", icon: Database, label: "Action", sub: "CRM update", cx: 73, cy: 24 },
  { id: "log", icon: FileText, label: "Log", sub: "evidence", cx: 73, cy: 72 },
  { id: "export", icon: FileCheck2, label: "Export", sub: "audit record", cx: 92, cy: 48 },
];

const EDGES: [NodeId, NodeId][] = [
  ["trigger", "ai"],
  ["trigger", "policy"],
  ["ai", "approval"],
  ["policy", "approval"],
  ["approval", "action"],
  ["approval", "log"],
  ["action", "export"],
  ["log", "export"],
];

const MARKERS: { node: NodeId; label: string }[] = [
  { node: "policy", label: "Data minimisation" },
  { node: "ai", label: "Risk metadata" },
  { node: "approval", label: "Human oversight" },
  { node: "log", label: "Redacted logs" },
];

function center(id: NodeId) {
  const n = NODES.find((x) => x.id === id)!;
  return { x: n.cx, y: n.cy };
}

export type GraphVariant = "forming" | "governed" | "approval" | "final";

export function SystemGraph({
  variant = "forming",
  showMarkers = false,
  showShield = false,
  className,
}: {
  variant?: GraphVariant;
  showMarkers?: boolean;
  showShield?: boolean;
  className?: string;
}) {
  const approvalState =
    variant === "approval" ? "review" : variant === "final" || variant === "governed" ? "approved" : "idle";

  const stroke =
    variant === "final"
      ? "#34d399"
      : variant === "approval"
        ? "#f5b14c"
        : "#38bdf8";

  return (
    <div className={cn("sg-stage relative aspect-[16/8] w-full", className)}>
      {/* governance shield grid */}
      {showShield ? (
        <div
          className="sg-shield pointer-events-none absolute inset-0 rounded-2xl border border-[#38bdf8]/25"
          style={{
            background:
              "linear-gradient(rgba(56,189,248,0.05),rgba(56,189,248,0.01)), repeating-linear-gradient(45deg, rgba(56,189,248,0.06) 0 2px, transparent 2px 10px)",
            boxShadow: "inset 0 0 60px -10px rgba(56,189,248,0.3)",
          }}
        />
      ) : null}

      {/* edges */}
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="sgEdge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
            <stop offset="100%" stopColor={variant === "forming" ? "#38bdf8" : "#f05a28"} stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {EDGES.map(([a, b]) => {
          const p1 = center(a);
          const p2 = center(b);
          const mx = (p1.x + p2.x) / 2;
          const d = `M ${p1.x} ${p1.y} C ${mx} ${p1.y}, ${mx} ${p2.y}, ${p2.x} ${p2.y}`;
          return (
            <path
              key={`${a}-${b}`}
              className="sg-edge"
              d={d}
              fill="none"
              stroke="url(#sgEdge)"
              strokeWidth={1.5}
              pathLength={1}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* nodes */}
      {NODES.map((n) => {
        const Icon = n.icon;
        const isApproval = n.id === "approval";
        const state =
          isApproval && approvalState === "review"
            ? "review"
            : isApproval && approvalState === "approved"
              ? "approved"
              : variant === "forming"
                ? "idle"
                : "done";
        const ring =
          state === "review"
            ? "border-[#f5b14c]/60 shadow-[0_0_26px_-4px_rgba(245,177,76,0.6)]"
            : state === "approved"
              ? "border-[#34d399]/55 shadow-[0_0_26px_-4px_rgba(52,211,153,0.55)]"
              : state === "done"
                ? "border-[#38bdf8]/40 shadow-[0_0_22px_-6px_rgba(56,189,248,0.45)]"
                : "border-white/12";
        const iconColor =
          state === "review" ? "#f5b14c" : state === "approved" ? "#34d399" : "#38bdf8";
        return (
          <div
            key={n.id}
            data-node={n.id}
            className={cn(
              "sg-node absolute z-10 flex w-[112px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl border bg-[#0b0e15]/92 p-2",
              ring,
            )}
            style={{ left: `${n.cx}%`, top: `${n.cy}%` }}
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]"
              style={{ color: iconColor }}
            >
              <Icon className="h-3 w-3" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10.5px] font-semibold leading-tight text-white">{n.label}</span>
              <span className="block truncate font-mono text-[7.5px] text-white/40">{n.sub}</span>
            </span>
          </div>
        );
      })}

      {/* governance checkpoint markers */}
      {showMarkers
        ? MARKERS.map((m, i) => {
            const c = center(m.node);
            return (
              <div
                key={m.label}
                className="sg-marker absolute z-20 -translate-x-1/2 rounded-full border border-[#38bdf8]/40 bg-[#0a141f]/90 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[#a5e3ff]"
                style={{ left: `${c.x}%`, top: `${c.y - 14}%` }}
                data-marker={i}
              >
                {m.label}
              </div>
            );
          })
        : null}
    </div>
  );
}
