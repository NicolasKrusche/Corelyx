"use client";

import React, { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node as ReactFlowNode,
  type Edge as ReactFlowEdge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import type { ProgramSchema } from "@flowos/schema";

// ─── Props ───────────────────────────────────────────────────────────────────

interface SchemaPreviewProps {
  schema: ProgramSchema | null;
  className?: string;
}

/**
 * SchemaPreview — a read-only mini React Flow render of a generated schema.
 *
 * Converts the canonical ProgramSchema into React Flow nodes/edges and renders
 * them in a compact, non-interactive viewport. Node types are color-coded by
 * their schema type for quick visual scanning.
 */
export function SchemaPreview({ schema, className }: SchemaPreviewProps) {
  // Convert ProgramSchema → React Flow nodes/edges
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!schema) return { initialNodes: [], initialEdges: [] };

    const nodes: ReactFlowNode[] = schema.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      data: {
        label: node.label,
        description: node.description,
        connection: node.connection,
        status: node.status,
        config: node.config,
      },
      // Read-only, non-selectable
      draggable: false,
      selectable: false,
    }));

    const edges: ReactFlowEdge[] = schema.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: edge.type,
      label: edge.label ?? undefined,
      animated: edge.type === "event_subscription",
      markerEnd: { type: MarkerType.ArrowClosed },
      data: {
        condition: edge.condition,
        data_mapping: edge.data_mapping,
      },
    }));

    return { initialNodes: nodes, initialEdges: edges };
  }, [schema]);

  const [_nodes, , onNodesChange] = useNodesState(initialNodes);
  const [_edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Keep nodes/edges in sync when schema changes
  React.useEffect(() => {
    onNodesChange(
      initialNodes.map((n) => ({ type: "reset" as const, item: n })) as any
    );
    onEdgesChange(
      initialEdges.map((e) => ({ type: "reset" as const, item: e })) as any
    );
  }, [initialNodes, initialEdges, onNodesChange, onEdgesChange]);

  if (!schema) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20",
          className
        )}
      >
        <div className="text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40"
          >
            <path
              d="M4 6h16M4 12h16M4 18h10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-sm text-muted-foreground/60">
            Generated workflow will appear here
          </p>
          <p className="mt-1 text-xs text-muted-foreground/40">
            Enter a prompt and click Generate
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/60 bg-background",
        className
      )}
    >
      {/* Schema info bar */}
      <div className="flex items-center gap-3 border-b border-border/40 bg-muted/20 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-medium text-foreground/80">
            {schema.program_name}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">
          {schema.nodes.length} node{schema.nodes.length !== 1 ? "s" : ""} ·{" "}
          {schema.edges.length} edge{schema.edges.length !== 1 ? "s" : ""}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/40">
          {schema.execution_mode}
        </span>
      </div>

      {/* React Flow canvas (read-only) */}
      <div className="h-[320px]">
        <ReactFlow
          nodes={_nodes}
          edges={_edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          preventScrolling={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="currentColor"
            style={{ opacity: 0.1 }}
          />
        </ReactFlow>
      </div>

      {/* Node type legend */}
      <div className="flex flex-wrap gap-2 border-t border-border/40 bg-muted/20 px-3 py-1.5">
        {getNodeTypes(schema).map(({ type, count, color }) => (
          <div key={type} className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] text-muted-foreground/70">
              {type} ({count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  trigger: "#f59e0b",
  connection: "#3b82f6",
  step: "#8b5cf6",
  agent: "#10b981",
  agent_task: "#059669",
  note: "#ec4899",
  group: "#6b7280",
};

function getNodeTypes(
  schema: ProgramSchema
): Array<{ type: string; count: number; color: string }> {
  const counts = new Map<string, number>();
  for (const node of schema.nodes) {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({
      type,
      count,
      color: NODE_COLORS[type] ?? "#6b7280",
    }))
    .sort((a, b) => b.count - a.count);
}
