"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  type Node as ReactFlowNode,
  type Edge as ReactFlowEdge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { Node, Edge } from "@flowos/schema";
import { TriggerNode } from "@/components/nodes/TriggerNode";
import { AgentNode } from "@/components/nodes/AgentNode";
import { StepNode } from "@/components/nodes/StepNode";
import { ConnectionNode } from "@/components/nodes/ConnectionNode";
import { NoteNode } from "@/components/nodes/NoteNode";
import { GroupNode } from "@/components/nodes/GroupNode";
import { DataFlowEdge } from "@/components/edges/DataFlowEdge";
import { ControlFlowEdge } from "@/components/edges/ControlFlowEdge";
import { EventEdge } from "@/components/edges/EventEdge";
import { applyDagreLayout, needsLayout } from "@/lib/schema/layout";
import { useTheme } from "@/components/theme-provider";

// ─── Shared node / edge type registrations (same as EditorShell) ─────────────

const nodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  step: StepNode,
  connection: ConnectionNode,
  note: NoteNode,
  group: GroupNode,
} as const;

const edgeTypes = {
  data_flow: DataFlowEdge,
  control_flow: ControlFlowEdge,
  event_subscription: EventEdge,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ExecStatus = string; // "pending" | "running" | "completed" | "failed" | ...

function schemaNodeToRfNode(node: Node, execStatus?: ExecStatus): ReactFlowNode {
  const cfg = node.config as Record<string, unknown>;
  const style =
    node.type === "group"
      ? { width: (cfg.width as number) ?? 400, height: (cfg.height as number) ?? 300 }
      : node.type === "note"
        ? { width: 200, height: 120 }
        : undefined;

  return {
    id: node.id,
    type: node.type,
    draggable: false,
    selectable: false,
    connectable: false,
    position: node.position,
    ...(style ? { style } : {}),
    data: {
      label: node.label,
      description: node.description,
      connection: node.connection,
      // Inject live execution status so node components render the correct colour
      status: execStatus ?? node.status ?? "idle",
      config: node.config,
      validationState: "valid",
      errors: [],
      warnings: [],
    },
  };
}

function schemaEdgeToRfEdge(edge: Edge): ReactFlowEdge {
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: edge.type ?? "data_flow",
    label: edge.label ?? undefined,
    animated: edge.type === "event_subscription",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: {
      condition: edge.condition,
      data_mapping: edge.data_mapping,
      validationErrors: [],
    },
  };
}

// ─── RunGraphFlow ─────────────────────────────────────────────────────────────

export interface NodeExecInfo {
  node_id: string;
  status: string;
}

interface RunGraphFlowProps {
  nodeMap: Record<string, Node>;
  edges: Edge[];
  execs: NodeExecInfo[];
}

export function RunGraphFlow({ nodeMap, edges, execs }: RunGraphFlowProps) {
  const { base } = useTheme();
  const isDark = base === "dark";

  // Build stable RF edges once (edges don't change during a run)
  const rfEdges = useMemo<ReactFlowEdge[]>(
    () => edges.map(schemaEdgeToRfEdge),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges.map((e) => e.id).join(",")]
  );

  // Build initial RF nodes (with layout applied if needed)
  const initialRfNodes = useMemo<ReactFlowNode[]>(() => {
    const nodes = Object.values(nodeMap).map((n) => schemaNodeToRfNode(n));
    return needsLayout(nodes) ? applyDagreLayout(nodes, rfEdges) : nodes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(nodeMap).join(","), rfEdges]);

  const [rfNodes, setRfNodes] = useState<ReactFlowNode[]>(initialRfNodes);

  // Patch only the status data as execs arrive — keeps positions stable
  useEffect(() => {
    const statusByNode = new Map(execs.map((e) => [e.node_id, e.status]));
    setRfNodes((prev) =>
      prev.map((n) => {
        const status = statusByNode.get(n.id);
        if (!status || n.data.status === status) return n;
        return { ...n, data: { ...n.data, status } };
      })
    );
  }, [execs]);

  // Also re-seed if nodeMap structure changes (e.g. navigating between runs)
  useEffect(() => {
    setRfNodes(initialRfNodes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRfNodes]);

  if (Object.keys(nodeMap).length === 0) return null;

  return (
    <div
      className="w-full rounded-xl border border-border overflow-hidden"
      style={{ height: 380 }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={isDark ? "dark" : "light"}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        fitView
        fitViewOptions={{ padding: 0.15 }}
        defaultEdgeOptions={{
          type: "data_flow",
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
        className="relative z-10"
      >
        <Controls className="!border-border !bg-background !shadow-sm" />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}
        />
      </ReactFlow>
    </div>
  );
}
