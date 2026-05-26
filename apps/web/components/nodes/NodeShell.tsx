"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { NodeStatus } from "@flowos/schema";
import type { NodeValidationState } from "@/lib/validation";

// ─── Status Icons ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: NodeStatus | undefined }) {
  if (!status || status === "idle") return null;

  if (status === "running") {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-blue-400 border-t-transparent animate-spin"
        aria-label="Running"
      />
    );
  }

  if (status === "success") {
    return (
      <svg
        className="h-3 w-3 text-green-400"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-label="Success"
      >
        <path d="M3 8l3.5 3.5 6.5-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === "failed") {
    return (
      <svg
        className="h-3 w-3 text-red-400"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-label="Failed"
      >
        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
      </svg>
    );
  }

  if (status === "waiting_approval") {
    return (
      <svg
        className="h-3 w-3 text-amber-400"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-label="Waiting for approval"
      >
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3.5l2 1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (status === "skipped") {
    return (
      <svg
        className="h-3 w-3 text-slate-400"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-label="Skipped"
      >
        <path d="M4 8h8" strokeLinecap="round" />
      </svg>
    );
  }

  return null;
}

// ─── NodeShell Props ──────────────────────────────────────────────────────────

export interface NodeShellProps {
  selected: boolean;
  validationState: NodeValidationState;
  status?: NodeStatus;
  /** Tailwind bg class for the left accent bar, e.g. "bg-green-500" */
  accentColor?: string;
  /** Tailwind color classes for the selection ring glow, e.g. "ring-green-500/40 shadow-green-500/20" */
  accentRing?: string;
  children: React.ReactNode;
  className?: string;
}

// ─── NodeShell ────────────────────────────────────────────────────────────────

export function NodeShell({
  selected,
  validationState,
  status,
  accentColor,
  accentRing = "ring-blue-500/50 shadow-blue-500/20",
  children,
  className,
}: NodeShellProps) {
  const isError      = validationState === "error";
  const isWarning    = validationState === "warning";
  const isUnassigned = validationState === "unassigned";

  // Execution status flags
  const isRunning         = status === "running";
  const isSuccess         = status === "success" || status === "completed";
  const isExecFailed      = status === "failed";
  const isWaitingApproval = status === "waiting_approval";
  const isSkipped         = status === "skipped";

  return (
    <div
      className={cn(
        // Base
        "relative rounded-xl overflow-hidden",
        "bg-card dark:bg-[rgba(14,16,22,0.88)]",
        "dark:backdrop-blur-md",
        // Size
        "w-[220px] min-h-[88px] pl-5 pr-3.5 py-3",
        "flex flex-col gap-1",
        // Default border
        "border border-border dark:border-white/[0.09]",
        // Drop shadow
        "shadow-[0_4px_16px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.3)]",
        // ── Execution status rings (take priority over validation) ────────
        isRunning && [
          "border-blue-400/80 dark:border-blue-400/70",
          "shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_2px_rgba(96,165,250,0.55),0_0_18px_rgba(96,165,250,0.25)]",
          "dark:shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_2px_rgba(96,165,250,0.6),0_0_24px_rgba(96,165,250,0.3)]",
          "animate-pulse",
        ],
        isSuccess && !isRunning && [
          "border-green-400/60 dark:border-green-400/50",
          "shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_2px_rgba(74,222,128,0.4)]",
          "dark:shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_2px_rgba(74,222,128,0.4)]",
        ],
        isExecFailed && !isRunning && [
          "border-red-500/70 dark:border-red-500/60",
          "shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_2px_rgba(239,68,68,0.5)]",
          "dark:shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_2px_rgba(239,68,68,0.5)]",
        ],
        isWaitingApproval && !isRunning && [
          "border-amber-400/60 dark:border-amber-400/50",
          "shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_2px_rgba(251,191,36,0.45)]",
          "dark:shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_2px_rgba(251,191,36,0.45)]",
        ],
        isSkipped && "opacity-40",
        // ── Validation rings (only apply when no execution status active) ─
        !isRunning && !isSuccess && !isExecFailed && !isWaitingApproval && !isSkipped && [
          isError      && "border-red-500/60 shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_2px_rgba(239,68,68,0.35)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_2px_rgba(239,68,68,0.35)]",
          isWarning    && "border-yellow-400/60 shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_2px_rgba(250,204,21,0.30)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_2px_rgba(250,204,21,0.30)]",
          isUnassigned && "border-dashed dark:border-white/[0.06]",
        ],
        // ── Selection ring (skip if execution status already provides glow) ─
        selected && !isRunning && !isSuccess && !isExecFailed && !isWaitingApproval && !isError && !isWarning && cn(
          "border-primary/40 dark:border-white/[0.2]",
          "shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_2px_rgba(96,165,250,0.4)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_2px_rgba(96,165,250,0.4),0_0_16px_rgba(96,165,250,0.15)]"
        ),
        className
      )}
    >
      {/* Colored left accent bar */}
      {accentColor && (
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-[3px]",
            accentColor
          )}
        />
      )}

      {/* Subtle top highlight gloss — dark mode only */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent dark:block hidden" />

      {/* Status indicator — top right */}
      <div className="absolute top-2.5 right-2.5 flex items-center">
        <StatusIcon status={status} />
      </div>

      {children}
    </div>
  );
}
