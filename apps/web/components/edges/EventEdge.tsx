"use client";

import React from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

function edgeColor(sourceStatus?: string, selected?: boolean): string {
  if (selected) return "#1d4ed8";
  if (sourceStatus === "running")  return "#3b82f6";
  if (sourceStatus === "success")  return "#22c55e";
  if (sourceStatus === "failed")   return "#ef4444";
  return "#6b7280";
}

function EventEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  const sourceStatus = (data as Record<string, unknown> | undefined)?.sourceStatus as string | undefined;
  const color = edgeColor(sourceStatus, selected);
  const isActive = !!sourceStatus && sourceStatus !== "idle";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: selected ? 2 : isActive ? 2 : 1.5,
          strokeOpacity: isActive || selected ? 0.9 : 0.45,
          strokeDasharray: "8 4",
          strokeLinecap: "round",
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan rounded px-1.5 py-0.5 bg-background border border-border text-[10px] text-muted-foreground shadow-sm"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
// React Flow re-renders every custom edge on any store change (drag, selection,
// viewport). memo() with the default shallow prop compare limits re-renders to
// when this edge's own props (id/data/selected/…) actually change.
export const EventEdge = React.memo(EventEdgeImpl);
EventEdge.displayName = "EventEdge";
