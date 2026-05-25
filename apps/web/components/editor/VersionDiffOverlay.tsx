"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { SchemaDiff, NodeDiff, EdgeDiff } from "@/lib/editor/diff";

// ─── Props ────────────────────────────────────────────────────────────────────

interface VersionDiffOverlayProps {
  diff: SchemaDiff;
  baseVersionLabel: string;
  onClose: () => void;
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: "added" | "removed" | "modified" }) {
  const styles: Record<typeof kind, string> = {
    added: "bg-green-500/15 text-green-400",
    removed: "bg-red-500/15 text-red-400",
    modified: "bg-amber-500/15 text-amber-400",
  };
  return (
    <span className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0", styles[kind])}>
      {kind}
    </span>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function DiffRow({ label, badge, sub }: { label: string; badge: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
      {badge}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-foreground truncate">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ─── VersionDiffOverlay ───────────────────────────────────────────────────────

export function VersionDiffOverlay({ diff, baseVersionLabel, onClose }: VersionDiffOverlayProps) {
  const totalChanges = diff.nodes.length + diff.edges.length;

  return (
    <div
      className={cn(
        "absolute inset-x-4 bottom-4 z-40 mx-auto max-w-xl",
        "bg-background border border-border rounded-xl shadow-2xl",
        "flex flex-col overflow-hidden",
        "max-h-[50vh]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5 text-muted-foreground">
            <path d="M4 8h8M4 4h8M4 12h5" strokeLinecap="round" />
          </svg>
          <span className="text-xs font-semibold">Diff — current vs {baseVersionLabel}</span>
          <span className={cn(
            "text-[10px] font-medium rounded-sm px-1.5 py-0.5",
            diff.isIdentical ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400",
          )}>
            {diff.isIdentical ? "identical" : `${totalChanges} change${totalChanges !== 1 ? "s" : ""}`}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close diff"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {diff.isIdentical ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No changes — current schema is identical to {baseVersionLabel}.
          </p>
        ) : (
          <div className="space-y-4">
            {diff.nodes.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Nodes ({diff.nodes.length})
                </p>
                <div>
                  {diff.nodes.map((nd: NodeDiff) => (
                    <DiffRow
                      key={nd.id}
                      label={nd.label || nd.type}
                      badge={<KindBadge kind={nd.kind} />}
                      sub={nd.changedFields ? `Changed: ${nd.changedFields.join(", ")}` : nd.type}
                    />
                  ))}
                </div>
              </div>
            )}

            {diff.edges.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Edges ({diff.edges.length})
                </p>
                <div>
                  {diff.edges.map((ed: EdgeDiff) => (
                    <DiffRow
                      key={ed.id}
                      label={`${ed.from.slice(0, 8)}… → ${ed.to.slice(0, 8)}…`}
                      badge={<KindBadge kind={ed.kind} />}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
