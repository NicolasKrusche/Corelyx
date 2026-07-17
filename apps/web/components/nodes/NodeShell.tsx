"use client";

import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Plug, Plus, Shuffle, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeStatus } from "@flowos/schema";
import type { NodeValidationState } from "@/lib/validation";
import type { NodeVariant } from "@/components/editor/NodePalettePanel";
import { useNodeCanvas } from "./node-canvas-context";
import { ProviderLogo } from "./ProviderLogo";

// ─── Accent system ────────────────────────────────────────────────────────────

export type NodeAccent = "green" | "sky" | "blue" | "purple" | "amber" | "slate";

interface AccentDef {
  /** Solid medallion fill */
  solid: string;
  /** Kicker / accent text */
  text: string;
  /** Soft chip background + text (badges) */
  soft: string;
  /** Handle fill */
  handle: string;
  /** Strong rgba glow (used only for the selection ring) */
  glow: string;
  /** Faint rgba glow */
  glowSoft: string;
}

const ACCENT: Record<NodeAccent, AccentDef> = {
  green:  { solid: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", soft: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300", handle: "!bg-emerald-500", glow: "rgba(16,185,129,0.55)", glowSoft: "rgba(16,185,129,0.18)" },
  sky:    { solid: "bg-sky-500",     text: "text-sky-600 dark:text-sky-400",         soft: "bg-sky-500/10 text-sky-600 dark:text-sky-300",            handle: "!bg-sky-500",     glow: "rgba(14,165,233,0.55)", glowSoft: "rgba(14,165,233,0.18)" },
  blue:   { solid: "bg-blue-500",    text: "text-blue-600 dark:text-blue-400",       soft: "bg-blue-500/10 text-blue-600 dark:text-blue-300",         handle: "!bg-blue-500",    glow: "rgba(59,130,246,0.55)", glowSoft: "rgba(59,130,246,0.18)" },
  purple: { solid: "bg-purple-500",  text: "text-purple-600 dark:text-purple-400",   soft: "bg-purple-500/10 text-purple-600 dark:text-purple-300",   handle: "!bg-purple-500",  glow: "rgba(168,85,247,0.55)", glowSoft: "rgba(168,85,247,0.18)" },
  amber:  { solid: "bg-amber-500",   text: "text-amber-600 dark:text-amber-400",     soft: "bg-amber-500/10 text-amber-600 dark:text-amber-300",      handle: "!bg-amber-500",   glow: "rgba(245,158,11,0.55)", glowSoft: "rgba(245,158,11,0.18)" },
  slate:  { solid: "bg-slate-400",   text: "text-slate-500 dark:text-slate-400",     soft: "bg-slate-500/10 text-slate-600 dark:text-slate-300",      handle: "!bg-slate-400",   glow: "rgba(100,116,139,0.5)", glowSoft: "rgba(100,116,139,0.16)" },
};

// ─── Target handle ────────────────────────────────────────────────────────────

export function NodeHandle({
  type,
  position,
  accent,
}: {
  type: "source" | "target";
  position: Position;
  accent: NodeAccent;
}) {
  const a = ACCENT[accent];
  return (
    <Handle
      type={type}
      position={position}
      className={cn(
        "!h-3.5 !w-3.5 !rounded-full !border-[2.5px] !border-card transition-transform duration-150 hover:!scale-125",
        a.handle,
      )}
      style={{ boxShadow: `0 0 0 3px ${a.glowSoft}` }}
    />
  );
}

// ─── Source handle with an embedded "+" add button ────────────────────────────

const ADD_OPTIONS: { label: string; icon: LucideIcon; variant: NodeVariant }[] = [
  { label: "Add step", icon: Shuffle, variant: { type: "step", subtype: "transform" } },
  { label: "Add connection", icon: Plug, variant: { type: "connection", subtype: "http" } },
  { label: "Add AI agent", icon: Sparkles, variant: { type: "agent" } },
];

export function SourceAddHandle({ nodeId, accent }: { nodeId: string; accent: NodeAccent }) {
  const { addConnectedNode } = useNodeCanvas();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Handle
        type="source"
        position={Position.Bottom}
        onClick={(e) => {
          if (!addConnectedNode) return;
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          "!flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !border-card",
          accent && ACCENT[accent].handle,
        )}
        style={{ boxShadow: `0 0 0 3px ${ACCENT[accent].glowSoft}` }}
      >
        {addConnectedNode && <Plus className="pointer-events-none h-3 w-3 text-white" strokeWidth={3} />}
      </Handle>

      {open && addConnectedNode && (
        <>
          <div className="nodrag nopan fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="nodrag nopan absolute left-1/2 top-full z-30 mt-3 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-xl">
            {ADD_OPTIONS.map((opt) => {
              const OptIcon = opt.icon;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    addConnectedNode(nodeId, opt.variant);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-popover-foreground transition-colors hover:bg-accent"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <OptIcon className="h-3.5 w-3.5" />
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: NodeStatus | undefined }) {
  if (!status || status === "idle") return null;

  if (status === "running") {
    return <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-blue-400 border-t-transparent animate-spin" aria-label="Running" />;
  }
  if (status === "success") {
    return (
      <svg className="h-3 w-3 text-green-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} aria-label="Success">
        <path d="M3 8l3.5 3.5 6.5-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg className="h-3 w-3 text-red-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} aria-label="Failed">
        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "waiting_approval") {
    return (
      <svg className="h-3 w-3 text-amber-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-label="Waiting for approval">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3.5l2 1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "skipped") {
    return (
      <svg className="h-3 w-3 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-label="Skipped">
        <path d="M4 8h8" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

// ─── NodeShell ────────────────────────────────────────────────────────────────

export interface NodeBadge {
  label: string;
  tone?: NodeAccent | "neutral";
}

export interface NodeShellProps {
  selected: boolean;
  validationState: NodeValidationState;
  status?: NodeStatus;
  accent: NodeAccent;
  icon: LucideIcon;
  /** When set, render the connector's brand logo instead of the lucide icon. */
  logo?: { provider?: string | null; label: string };
  /** Small uppercase kicker, e.g. "Trigger · Webhook" */
  kicker: string;
  title: string;
  subtitle?: string;
  /** Secondary mono meta line, e.g. a URL or "via Gmail" */
  meta?: string;
  badges?: NodeBadge[];
  error?: string;
  warning?: string;
  /** Genesis V2: open clarifying question pinned to this node. */
  questionPin?: string | null;
  /**
   * Compact sketch of the node's output shape, e.g. "emails: [{ id, threadId }]".
   * Rendered as an always-on "→ output" line so the graph reads as a data
   * pipeline. See lib/genesis/node-preview.
   */
  outputPreview?: string | null;
  /**
   * Inline quick-edit controls, rendered inside the card below the preview.
   * Node components pass this only when the node is selected, so the canvas
   * stays uncluttered until you focus a node.
   */
  footer?: React.ReactNode;
}

function badgeClasses(tone: NodeBadge["tone"]): string {
  if (!tone || tone === "neutral") {
    return "bg-black/[0.05] text-zinc-600 dark:bg-white/[0.07] dark:text-zinc-300";
  }
  return ACCENT[tone].soft;
}

export function NodeShell({
  selected,
  validationState,
  status,
  accent,
  icon: Icon,
  logo,
  kicker,
  title,
  subtitle,
  meta,
  badges,
  error,
  warning,
  questionPin,
  outputPreview,
  footer,
}: NodeShellProps) {
  const a = ACCENT[accent];

  // Ring color priority: execution status → validation → selection.
  let ring: string | null = null;
  let pulse = false;
  if (status === "running") { ring = "rgba(96,165,250,0.75)"; pulse = true; }
  else if (status === "success") ring = "rgba(74,222,128,0.6)";
  else if (status === "failed") ring = "rgba(239,68,68,0.65)";
  else if (status === "waiting_approval") ring = "rgba(251,191,36,0.6)";
  else if (validationState === "error") ring = "rgba(239,68,68,0.5)";
  else if (validationState === "warning") ring = "rgba(250,204,21,0.5)";
  else if (questionPin) ring = "rgba(251,191,36,0.55)";
  else if (selected) ring = a.glow;

  const baseShadow = "0 6px 22px -8px rgba(0,0,0,0.35), 0 2px 6px -2px rgba(0,0,0,0.12)";
  const boxShadow = ring ? `${baseShadow}, 0 0 0 2px ${ring}` : baseShadow;

  return (
    <div
      className={cn(
        "relative w-[238px] overflow-hidden rounded-[14px] p-3",
        "bg-white dark:bg-[rgba(17,19,26,0.94)] dark:backdrop-blur-xl",
        "border border-black/[0.07] dark:border-white/[0.09]",
        status === "skipped" && "opacity-40",
        validationState === "unassigned" && "border-dashed",
        pulse && "animate-pulse",
      )}
      style={{ boxShadow }}
    >
      {/* Status indicator — top right */}
      <div className="absolute right-2.5 top-2.5">
        <StatusIcon status={status} />
      </div>

      {/* Genesis clarifying-question pin — the question itself is answered in
          the questions panel; the pin anchors it to the node it concerns. */}
      {questionPin && (
        <div
          className="genesis-question-pin absolute left-2 top-2 z-10 grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-[11px] font-bold text-amber-950 shadow-md ring-2 ring-amber-200/60"
          title={questionPin}
          aria-label={`Open question: ${questionPin}`}
        >
          ?
        </div>
      )}

      {/* Header: medallion + title */}
      <div className="flex items-start gap-2.5">
        {logo ? (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-inset ring-black/10 dark:bg-zinc-100">
            <ProviderLogo provider={logo.provider} label={logo.label} className="h-6 w-6" />
          </div>
        ) : (
          <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", a.solid)}>
            <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2} />
          </div>
        )}

        <div className="min-w-0 flex-1 pr-4 pt-0.5">
          <p className={cn("truncate text-[10px] font-semibold uppercase tracking-[0.07em]", a.text)}>{kicker}</p>
          <p className="mt-0.5 truncate text-[13px] font-semibold leading-snug text-foreground">{title}</p>
        </div>
      </div>

      {subtitle && <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{subtitle}</p>}
      {meta && <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80">{meta}</p>}

      {badges && badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {badges.map((b) => (
            <span key={b.label} className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium", badgeClasses(b.tone))}>
              {b.label}
            </span>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-[10px] font-medium text-red-600 dark:text-red-400">{error}</p>}
      {!error && warning && <p className="mt-2 text-[10px] font-medium text-yellow-600 dark:text-yellow-400">{warning}</p>}

      {/* Output preview — always on, so the graph reads as a data pipeline. */}
      {outputPreview && (
        <div className="mt-2 flex items-start gap-1 border-t border-black/[0.06] pt-1.5 dark:border-white/[0.07]">
          <span className={cn("mt-px text-[10px] font-bold leading-none", a.text)} aria-hidden>→</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground/80" title={outputPreview}>
            {outputPreview}
          </span>
        </div>
      )}

      {/* Inline quick-edit — passed by node components only when selected. */}
      {footer && (
        <div className="nodrag nopan mt-2 border-t border-black/[0.06] pt-2 dark:border-white/[0.07]">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── Inline quick-edit select ─────────────────────────────────────────────────
// A compact labelled dropdown for editing one key field right on the node card.
// Stops pointer/key events from reaching the canvas so React Flow doesn't drag,
// pan, or treat typing as a shortcut while the user interacts with it.

export function InlineSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        className={cn(
          "nodrag nopan w-full cursor-pointer rounded-md px-1.5 py-1 text-[11px] text-foreground outline-none",
          "border border-black/10 bg-white focus:border-primary/50 dark:border-white/15 dark:bg-zinc-900",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
