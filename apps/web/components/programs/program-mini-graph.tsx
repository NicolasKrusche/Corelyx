"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
  type Node as ReactFlowNode,
  type Edge as ReactFlowEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import type { Node, Edge } from "@flowos/schema";

// ─── Node / edge type registrations ──────────────────────────────────────────

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

// ─── Coercion helpers ─────────────────────────────────────────────────────────

function coerceNodes(raw: unknown[]): Node[] {
  return raw.filter((n): n is Node => {
    if (!n || typeof n !== "object") return false;
    const r = n as Record<string, unknown>;
    return typeof r.id === "string" && typeof r.type === "string";
  }) as Node[];
}

function coerceEdges(raw: unknown[]): Edge[] {
  return raw.filter((e): e is Edge => {
    if (!e || typeof e !== "object") return false;
    const r = e as Record<string, unknown>;
    return typeof r.id === "string" && typeof r.from === "string" && typeof r.to === "string";
  }) as Edge[];
}

function toRfNode(node: Node): ReactFlowNode {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
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
    position: (node.position as { x: number; y: number }) ?? { x: 0, y: 0 },
    ...(style ? { style } : {}),
    data: {
      label: node.label,
      description: node.description,
      connection: node.connection,
      status: "idle",
      config: node.config,
      validationState: "valid",
      errors: [],
      warnings: [],
    },
  };
}

function toRfEdge(edge: Edge): ReactFlowEdge {
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

// ─── Canvas ───────────────────────────────────────────────────────────────────

interface MiniGraphCanvasProps {
  rawNodes: unknown[];
  rawEdges: unknown[];
}

function MiniGraphCanvas({ rawNodes, rawEdges }: MiniGraphCanvasProps) {
  const { base } = useTheme();
  const isDark = base === "dark";

  const rfEdges = useMemo<ReactFlowEdge[]>(
    () => coerceEdges(rawEdges).map(toRfEdge),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawEdges.length],
  );

  const rfNodes = useMemo<ReactFlowNode[]>(() => {
    const nodes = coerceNodes(rawNodes).map(toRfNode);
    return needsLayout(nodes) ? applyDagreLayout(nodes, rfEdges) : nodes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawNodes.length, rfEdges]);

  if (rfNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No nodes in this workflow yet.
      </div>
    );
  }

  return (
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
    >
      <Controls className="!border-border !bg-background !shadow-sm" />
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}
      />
    </ReactFlow>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface ProgramMiniGraphProps {
  /** Raw `schema.nodes` from the DB (Json[]) */
  rawNodes: unknown[];
  /** Raw `schema.edges` from the DB (Json[]) */
  rawEdges: unknown[];
  programName: string;
}

export function ProgramMiniGraph({ rawNodes, rawEdges, programName }: ProgramMiniGraphProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Eye className="h-4 w-4" />
        View graph
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="text-sm font-semibold">{programName} — workflow graph</DialogTitle>
          </DialogHeader>
          <div style={{ height: 560 }} className="relative">
            <MiniGraphCanvas rawNodes={rawNodes} rawEdges={rawEdges} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
