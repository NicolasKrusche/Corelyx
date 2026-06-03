"use client";

import React, { useState, useCallback, useEffect } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeResizer } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useOptionalEditorDispatch } from "@/lib/editor/state";
import type { GroupConfig } from "@flowos/schema";

type GroupColor = NonNullable<GroupConfig["color"]>;

const COLOR_STYLES: Record<GroupColor, { border: string; bg: string; strip: string; icon: string }> = {
  zinc: {
    border: "border-zinc-300/60 dark:border-zinc-600/60",
    bg: "bg-zinc-50/20 dark:bg-zinc-800/10",
    strip: "bg-zinc-100 dark:bg-zinc-800 border-zinc-300/60 dark:border-zinc-600/60",
    icon: "text-zinc-400 dark:text-zinc-500",
  },
  blue: {
    border: "border-blue-300/70 dark:border-blue-700/70",
    bg: "bg-blue-50/25 dark:bg-blue-950/15",
    strip: "bg-blue-100 dark:bg-blue-950 border-blue-300/70 dark:border-blue-700/70",
    icon: "text-blue-500 dark:text-blue-400",
  },
  green: {
    border: "border-green-300/70 dark:border-green-700/70",
    bg: "bg-green-50/25 dark:bg-green-950/15",
    strip: "bg-green-100 dark:bg-green-950 border-green-300/70 dark:border-green-700/70",
    icon: "text-green-500 dark:text-green-400",
  },
  amber: {
    border: "border-amber-300/70 dark:border-amber-700/70",
    bg: "bg-amber-50/25 dark:bg-amber-950/15",
    strip: "bg-amber-100 dark:bg-amber-950 border-amber-300/70 dark:border-amber-700/70",
    icon: "text-amber-500 dark:text-amber-400",
  },
  pink: {
    border: "border-pink-300/70 dark:border-pink-700/70",
    bg: "bg-pink-50/25 dark:bg-pink-950/15",
    strip: "bg-pink-100 dark:bg-pink-950 border-pink-300/70 dark:border-pink-700/70",
    icon: "text-pink-500 dark:text-pink-400",
  },
};

const COLORS: GroupColor[] = ["zinc", "blue", "green", "amber", "pink"];

// ─── GroupNode data interface ──────────────────────────────────────────────────

interface GroupNodeData {
  label: string;
  config: GroupConfig;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GroupNode({ id, data, selected }: NodeProps) {
  const dispatch = useOptionalEditorDispatch();
  const nodeData = data as unknown as GroupNodeData;
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(nodeData.label ?? "Group");
  const color = nodeData.config?.color ?? "zinc";
  const styles = COLOR_STYLES[color];

  useEffect(() => {
    setLabelValue(nodeData.label ?? "Group");
  }, [nodeData.label]);

  const commitLabel = useCallback(() => {
    setEditingLabel(false);
    if (!dispatch) return;
    dispatch({ type: "UPDATE_NODE", nodeId: id, patch: { label: labelValue } });
  }, [dispatch, id, labelValue]);

  const handleColorChange = useCallback((nextColor: GroupColor) => {
    if (!dispatch) return;
    dispatch({ type: "UPDATE_NODE_CONFIG", nodeId: id, config: { color: nextColor } });
  }, [dispatch, id]);

  return (
    <>
      {/* Resizer handles — only shown when selected */}
      <NodeResizer
        isVisible={Boolean(dispatch && selected)}
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

      {/* Frame — pointer-events-none so clicks fall through to children or the RF
          wrapper (which handles group selection/drag). Interactive children
          re-enable pointer-events individually. */}
      <div
        className={cn(
          "relative w-full h-full rounded-xl border-2 border-dashed pointer-events-none",
          styles.border,
          styles.bg,
          selected && "ring-1 ring-foreground/20",
        )}
      >
        {selected && dispatch && (
          <div className="nodrag pointer-events-auto absolute -top-8 right-0 z-20 flex items-center gap-1 rounded-md border border-border bg-popover px-1.5 py-1 shadow-md">
            <span className="mr-0.5 text-[10px] font-medium text-muted-foreground">Group</span>
            {COLORS.map((nextColor) => (
              <button
                key={nextColor}
                type="button"
                aria-label={`${nextColor} group`}
                onClick={() => handleColorChange(nextColor)}
                className={cn(
                  "h-4 w-4 rounded-full border-2 transition-transform hover:scale-110",
                  nextColor === "zinc" && "bg-zinc-300 border-zinc-500",
                  nextColor === "blue" && "bg-blue-300 border-blue-500",
                  nextColor === "green" && "bg-green-300 border-green-500",
                  nextColor === "amber" && "bg-amber-300 border-amber-500",
                  nextColor === "pink" && "bg-pink-300 border-pink-500",
                  nextColor === color && "ring-2 ring-offset-1 ring-foreground/40",
                )}
              />
            ))}
          </div>
        )}

        {/* Label strip */}
        <div className="pointer-events-auto absolute -top-px left-0 flex items-center">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-br-md px-2.5 py-0.5",
              "border border-l-0 border-t-0",
              styles.strip,
              "shadow-sm",
            )}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className={cn("h-3 w-3 shrink-0", styles.icon)}
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
                onDoubleClick={() => {
                  if (dispatch) setEditingLabel(true);
                }}
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
