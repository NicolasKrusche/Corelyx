"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ProgramSchema } from "@flowos/schema";
import { diffSchemas, type GenesisPatchSummary } from "@/lib/genesis/patch";

// ─── Props ───────────────────────────────────────────────────────────────────

interface DiffViewerProps {
  before: ProgramSchema;
  after: ProgramSchema;
  className?: string;
}

/**
 * DiffViewer — side-by-side schema diff between two iterations.
 *
 * Shows added/removed/updated nodes and edges in two columns, following the
 * VersionHistoryPanel pattern. Uses the existing diffSchemas from genesis/patch
 * for deterministic diff computation.
 */
export function DiffViewer({ before, after, className }: DiffViewerProps) {
  const diff = useMemo(() => diffSchemas(before, after), [before, after]);

  const beforeNodes = useMemo(() => {
    const removedIds = new Set(diff.removed_node_ids);
    return before.nodes.filter(
      (n) => removedIds.has(n.id) || diff.updated_node_ids.includes(n.id)
    );
  }, [before, diff]);

  const afterNodes = useMemo(() => {
    const addedIds = new Set(diff.added_node_ids);
    return after.nodes.filter(
      (n) => addedIds.has(n.id) || diff.updated_node_ids.includes(n.id)
    );
  }, [after, diff]);

  const beforeEdges = useMemo(() => {
    const removedIds = new Set(diff.removed_edge_ids);
    return before.edges.filter(
      (e) => removedIds.has(e.id) || diff.updated_edge_ids.includes(e.id)
    );
  }, [before, diff]);

  const afterEdges = useMemo(() => {
    const addedIds = new Set(diff.added_edge_ids);
    return after.edges.filter(
      (e) => addedIds.has(e.id) || diff.updated_edge_ids.includes(e.id)
    );
  }, [after, diff]);

  const totalChanges =
    diff.added_node_ids.length +
    diff.removed_node_ids.length +
    diff.updated_node_ids.length +
    diff.added_edge_ids.length +
    diff.removed_edge_ids.length +
    diff.updated_edge_ids.length;

  if (totalChanges === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-border/60 bg-muted/20 p-6",
          className
        )}
      >
        <p className="text-sm text-muted-foreground/60">
          No structural changes between versions
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Summary bar */}
      <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-2">
          {diff.added_node_ids.length > 0 && (
            <DiffBadge kind="add" count={diff.added_node_ids.length} label="nodes" />
          )}
          {diff.removed_node_ids.length > 0 && (
            <DiffBadge kind="remove" count={diff.removed_node_ids.length} label="nodes" />
          )}
          {diff.updated_node_ids.length > 0 && (
            <DiffBadge kind="update" count={diff.updated_node_ids.length} label="nodes" />
          )}
          {diff.added_edge_ids.length > 0 && (
            <DiffBadge kind="add" count={diff.added_edge_ids.length} label="edges" />
          )}
          {diff.removed_edge_ids.length > 0 && (
            <DiffBadge kind="remove" count={diff.removed_edge_ids.length} label="edges" />
          )}
          {diff.updated_edge_ids.length > 0 && (
            <DiffBadge kind="update" count={diff.updated_edge_ids.length} label="edges" />
          )}
        </div>
        {diff.change_summary && (
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            {diff.change_summary}
          </span>
        )}
      </div>

      {/* Side-by-side diff */}
      <div className="grid grid-cols-2 gap-3">
        {/* Before column */}
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 px-1">
            Before
          </p>
          <div className="space-y-1">
            {beforeNodes.map((node) => {
              const isRemoved = diff.removed_node_ids.includes(node.id);
              const isUpdated = diff.updated_node_ids.includes(node.id);
              return (
                <DiffRow
                  key={node.id}
                  kind={isRemoved ? "remove" : "update"}
                  label={node.label}
                  sublabel={`${node.type} · ${node.id}`}
                />
              );
            })}
            {beforeEdges.map((edge) => {
              const isRemoved = diff.removed_edge_ids.includes(edge.id);
              const isUpdated = diff.updated_edge_ids.includes(edge.id);
              return (
                <DiffRow
                  key={edge.id}
                  kind={isRemoved ? "remove" : "update"}
                  label={edge.label ?? `${edge.from} → ${edge.to}`}
                  sublabel={`${edge.type} · ${edge.id}`}
                />
              );
            })}
          </div>
        </div>

        {/* After column */}
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 px-1">
            After
          </p>
          <div className="space-y-1">
            {afterNodes.map((node) => {
              const isAdded = diff.added_node_ids.includes(node.id);
              const isUpdated = diff.updated_node_ids.includes(node.id);
              return (
                <DiffRow
                  key={node.id}
                  kind={isAdded ? "add" : "update"}
                  label={node.label}
                  sublabel={`${node.type} · ${node.id}`}
                />
              );
            })}
            {afterEdges.map((edge) => {
              const isAdded = diff.added_edge_ids.includes(edge.id);
              const isUpdated = diff.updated_edge_ids.includes(edge.id);
              return (
                <DiffRow
                  key={edge.id}
                  kind={isAdded ? "add" : "update"}
                  label={edge.label ?? `${edge.from} → ${edge.to}`}
                  sublabel={`${edge.type} · ${edge.id}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DiffBadge({
  kind,
  count,
  label,
}: {
  kind: "add" | "remove" | "update";
  count: number;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        kind === "add" &&
          "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
        kind === "remove" &&
          "bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400",
        kind === "update" &&
          "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
      )}
    >
      <span>{kind === "add" ? "+" : kind === "remove" ? "−" : "~"}</span>
      <span>
        {count} {label}
      </span>
    </span>
  );
}

function DiffRow({
  kind,
  label,
  sublabel,
}: {
  kind: "add" | "remove" | "update";
  label: string;
  sublabel: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs",
        kind === "add" &&
          "border-emerald-500/20 bg-emerald-500/5",
        kind === "remove" &&
          "border-red-500/20 bg-red-500/5",
        kind === "update" &&
          "border-amber-500/20 bg-amber-500/5"
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold",
          kind === "add" &&
            "bg-emerald-500/15 text-emerald-600",
          kind === "remove" &&
            "bg-red-500/15 text-red-600",
          kind === "update" &&
            "bg-amber-500/15 text-amber-600"
        )}
      >
        {kind === "add" ? "+" : kind === "remove" ? "−" : "~"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground/80">{label}</p>
        <p className="truncate text-[10px] text-muted-foreground/50">
          {sublabel}
        </p>
      </div>
    </div>
  );
}
