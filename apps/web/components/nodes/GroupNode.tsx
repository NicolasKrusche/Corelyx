"use client";

import React, { useState, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeResizer } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useEditorDispatch } from "@/lib/editor/state";

// ─── GroupNode data interface ──────────────────────────────────────────────────

interface GroupNodeData {
  label: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GroupNode({ id, data, selected }: NodeProps) {
  const dispatch = useEditorDispatch();
  const nodeData = data as unknown as GroupNodeData;
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(nodeData.label ?? "Group");

  const commitLabel = useCallback(() => {
    setEditingLabel(false);
    dispatch({ type: "UPDATE_NODE", nodeId: id, patch: { label: labelValue } });
  }, [dispatch, id, labelValue]);

  return (
    <>
      {/* Resizer handles — only shown when selected */}
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={150}
        lineStyle={{ borderColor: "hsl(var(--border))", borderWidth: 1.5 }}
        handleStyle={{
          width: 10,
          height: 10,
          borderRadius: 3,
          backgroundColor: "hsl(var(--background))",
          border: "1.5px solid hsl(var(--border))",
        }}
      />

      {/* Frame */}
      <div
        className={cn(
          "relative w-full h-full rounded-xl border-2 border-dashed",
          "border-zinc-300/60 dark:border-zinc-600/60",
          "bg-zinc-50/20 dark:bg-zinc-800/10",
          selected && "border-zinc-400/80 dark:border-zinc-500/80",
        )}
      >
        {/* Label strip */}
        <div className="absolute -top-px left-3 flex items-center">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-b-md px-2.5 py-0.5",
              "bg-zinc-100 dark:bg-zinc-800",
              "border border-t-0 border-zinc-300/60 dark:border-zinc-600/60",
              "shadow-sm",
            )}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-3 w-3 text-zinc-400 dark:text-zinc-500 shrink-0"
            >
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <path d="M6 6h4M6 10h4" strokeLinecap="round" />
            </svg>

            {editingLabel ? (
              <input
                autoFocus
                className={cn(
                  "nodrag bg-transparent text-[11px] font-medium text-foreground",
                  "border-none outline-none focus:outline-none w-24",
                )}
                value={labelValue}
                onChange={(e) => setLabelValue(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" || e.key === "Escape") commitLabel();
                }}
              />
            ) : (
              <span
                className="text-[11px] font-medium text-foreground/70 cursor-text select-none"
                onDoubleClick={() => setEditingLabel(true)}
              >
                {labelValue}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
