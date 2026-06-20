"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BookOpen, FileUp } from "lucide-react";

export type CanvasDoc = {
  id: string;
  title: string;
  source_type: string | null;
  embedding_status: string | null;
  canvas_x: number | null;
  canvas_y: number | null;
};

export type CanvasLink = { id: string; from_id: string; to_id: string; label: string | null };

type OrbData = {
  title: string;
  status: string | null;
  isFile: boolean;
  onOpen: () => void;
};

// ─── Orb node ─────────────────────────────────────────────────────────────────

function OrbNode({ data }: NodeProps) {
  const d = data as OrbData;
  const indexed = d.status === "ready";
  return (
    <div
      onClick={d.onOpen}
      title={d.title}
      className="group relative flex h-28 w-28 cursor-pointer flex-col items-center justify-center rounded-full border border-border/60 bg-gradient-to-br from-primary/15 via-primary/5 to-background text-center shadow-sm ring-1 ring-border/40 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/50"
    >
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary/70" />
      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary/70" />
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
        {d.isFile ? <FileUp className="h-3.5 w-3.5 text-primary" /> : <BookOpen className="h-3.5 w-3.5 text-primary" />}
      </span>
      <p className="mt-1.5 line-clamp-2 px-3 text-[11px] font-semibold leading-tight text-foreground">
        {d.title || "Untitled"}
      </p>
      <span
        className={`absolute right-3 top-3 h-2 w-2 rounded-full ${indexed ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
        title={indexed ? "Indexed" : "Keyword only"}
      />
    </div>
  );
}

const nodeTypes = { orb: OrbNode };

// Auto-place docs that don't have a saved position yet (loose grid).
function autoPosition(index: number): { x: number; y: number } {
  const cols = 4;
  return { x: (index % cols) * 200 + 40, y: Math.floor(index / cols) * 200 + 40 };
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

function Canvas({
  docs,
  links,
  onOpenDoc,
  canEdit,
}: {
  docs: CanvasDoc[];
  links: CanvasLink[];
  onOpenDoc: (id: string) => void;
  canEdit: boolean;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Build nodes/edges from props. Re-runs when docs/links change (add/edit/delete).
  const builtNodes = useMemo<Node[]>(
    () =>
      docs.map((doc, i) => ({
        id: doc.id,
        type: "orb",
        position:
          doc.canvas_x != null && doc.canvas_y != null
            ? { x: doc.canvas_x, y: doc.canvas_y }
            : autoPosition(i),
        data: {
          title: doc.title,
          status: doc.embedding_status,
          isFile: doc.source_type === "file",
          onOpen: () => onOpenDoc(doc.id),
        } satisfies OrbData,
        draggable: canEdit,
      })),
    [docs, onOpenDoc, canEdit]
  );

  const builtEdges = useMemo<Edge[]>(
    () =>
      links.map((l) => ({
        id: l.id,
        source: l.from_id,
        target: l.to_id,
        label: l.label ?? undefined,
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "hsl(var(--primary) / 0.5)", strokeWidth: 2 },
      })),
    [links]
  );

  useEffect(() => setNodes(builtNodes), [builtNodes, setNodes]);
  useEffect(() => setEdges(builtEdges), [builtEdges, setEdges]);

  const onConnect = useCallback(
    async (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      try {
        const res = await fetch("/api/agents/knowledge/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from_id: conn.source, to_id: conn.target }),
        });
        if (!res.ok) return;
        const { link } = (await res.json()) as { link: CanvasLink };
        setEdges((eds) =>
          addEdge(
            {
              id: link.id,
              source: link.from_id,
              target: link.to_id,
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { stroke: "hsl(var(--primary) / 0.5)", strokeWidth: 2 },
            },
            eds
          )
        );
      } catch {
        /* network error — the edge just won't appear */
      }
    },
    [setEdges]
  );

  const onNodeDragStop = useCallback(async (_e: unknown, node: Node) => {
    try {
      await fetch(`/api/agents/knowledge/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvas_x: node.position.x, canvas_y: node.position.y }),
      });
    } catch {
      /* best-effort position save */
    }
  }, []);

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    for (const e of deleted) {
      try {
        await fetch(`/api/agents/knowledge/links?id=${encodeURIComponent(e.id)}`, { method: "DELETE" });
      } catch {
        /* best-effort */
      }
    }
  }, []);

  return (
    <div className="h-[70vh] w-full overflow-hidden rounded-2xl border glass-panel">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={canEdit ? onConnect : undefined}
        onNodeDragStop={canEdit ? onNodeDragStop : undefined}
        onEdgesDelete={canEdit ? onEdgesDelete : undefined}
        nodesConnectable={canEdit}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      >
        <Background gap={20} className="opacity-50" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function KnowledgeCanvas(props: {
  docs: CanvasDoc[];
  links: CanvasLink[];
  onOpenDoc: (id: string) => void;
  canEdit: boolean;
}) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
