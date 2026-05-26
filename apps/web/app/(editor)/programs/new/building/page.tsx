"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  type Node as ReactFlowNode,
  type Edge as ReactFlowEdge,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { TriggerNode } from "@/components/nodes/TriggerNode";
import { AgentNode } from "@/components/nodes/AgentNode";
import { StepNode } from "@/components/nodes/StepNode";
import { ConnectionNode } from "@/components/nodes/ConnectionNode";
import { DataFlowEdge } from "@/components/edges/DataFlowEdge";
import { ControlFlowEdge } from "@/components/edges/ControlFlowEdge";
import { EventEdge } from "@/components/edges/EventEdge";
import { applyDagreLayout } from "@/lib/schema/layout";
import { Button } from "@/components/ui/button";

const NODE_TYPES = {
  trigger: TriggerNode,
  agent: AgentNode,
  step: StepNode,
  connection: ConnectionNode,
};

const EDGE_TYPES = {
  data_flow: DataFlowEdge,
  control_flow: ControlFlowEdge,
  event_subscription: EventEdge,
};

type GenesisPayload =
  | { description: string; connection_ids: string[]; api_key_id: string; model: string }
  | { description: string; connection_ids: string[]; use_platform_key: true };

type IncomingNode = {
  id: string;
  type: "trigger" | "agent" | "step" | "connection";
  label?: string;
  description?: string;
  connection?: string | null;
  config?: unknown;
  position?: { x: number; y: number };
};

type IncomingEdge = {
  id: string;
  from: string;
  to: string;
  type?: "data_flow" | "control_flow" | "event_subscription";
  label?: string | null;
};

const STORAGE_KEY = "flowos.genesis.pending";

// Module-scope: prevents React 18 StrictMode's double-invoked effect from
// starting the stream twice (and the first mount's cleanup from aborting it).
let streamStarted = false;

export default function BuildingPage() {
  return (
    <ReactFlowProvider>
      <BuildingCanvas />
    </ReactFlowProvider>
  );
}

function BuildingCanvas() {
  const router = useRouter();
  const rf = useReactFlow();
  const [nodes, setNodes] = useState<ReactFlowNode[]>([]);
  const [edges, setEdges] = useState<ReactFlowEdge[]>([]);
  const [programName, setProgramName] = useState<string>("");
  const [status, setStatus] = useState<string>("Contacting the model...");
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Mutable canvas state. We accumulate node/edge events here and flush to
  // React state on an rAF so a burst of events triggers one Dagre relayout +
  // one render, not one per event.
  const nodesRef = useRef<ReactFlowNode[]>([]);
  const edgesRef = useRef<ReactFlowEdge[]>([]);
  const pendingFlushRef = useRef(false);
  const fitViewScheduledRef = useRef(false);

  // Read payload + start stream once. React StrictMode replays mount effects in
  // development; without this guard, the replay can find sessionStorage already
  // consumed and redirect back to the prompt page.
  useEffect(() => {
    if (streamStarted) return;
    streamStarted = true;

    const raw = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    if (!raw) {
      streamStarted = false;
      router.replace("/programs/new");
      return;
    }

    let payload: GenesisPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      streamStarted = false;
      router.replace("/programs/new");
      return;
    }

    sessionStorage.removeItem(STORAGE_KEY);
    runStream(payload).catch(() => {
      // handled inside runStream
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleFlush = () => {
    if (pendingFlushRef.current) return;
    pendingFlushRef.current = true;
    requestAnimationFrame(() => {
      pendingFlushRef.current = false;
      const laidOut = relayout(nodesRef.current, edgesRef.current);
      nodesRef.current = laidOut;
      setNodes(laidOut);
      setEdges(edgesRef.current.slice());
      scheduleFitView();
    });
  };

  const scheduleFitView = () => {
    if (fitViewScheduledRef.current) return;
    fitViewScheduledRef.current = true;
    // Fire once per animation cycle. fitView's own 400ms transition handles
    // the smoothness — calling it on every node add just stacks animations.
    setTimeout(() => {
      fitViewScheduledRef.current = false;
      try {
        rf.fitView({ padding: 0.2, duration: 400 });
      } catch {
        // no-op if canvas not ready
      }
    }, 450);
  };

  const addNode = (incoming: IncomingNode) => {
    if (nodesRef.current.some((n) => n.id === incoming.id)) return;
    const rfNode: ReactFlowNode = {
      id: incoming.id,
      type: incoming.type,
      position: incoming.position ?? { x: 0, y: 0 },
      data: {
        label: incoming.label ?? incoming.id,
        description: incoming.description ?? "",
        connection: incoming.connection ?? null,
        status: "idle",
        config: incoming.config ?? {},
        validationState: "valid",
        errors: [],
        warnings: [],
      },
      draggable: false,
      selectable: false,
    };
    nodesRef.current = [...nodesRef.current, rfNode];
    scheduleFlush();
  };

  const addEdge = (incoming: IncomingEdge) => {
    if (edgesRef.current.some((e) => e.id === incoming.id)) return;
    const rfEdge: ReactFlowEdge = {
      id: incoming.id,
      source: incoming.from,
      target: incoming.to,
      type: incoming.type ?? "data_flow",
      label: incoming.label ?? undefined,
      animated: incoming.type === "event_subscription",
      markerEnd: { type: MarkerType.ArrowClosed },
      data: {
        condition: null,
        data_mapping: null,
        validationErrors: [],
      },
    };
    edgesRef.current = [...edgesRef.current, rfEdge];
    scheduleFlush();
  };

  async function runStream(payload: GenesisPayload) {
    try {
      const res = await fetch("/api/genesis/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) {
        let message = `Failed to open stream (status ${res.status}).`;
        try {
          const body = (await res.clone().json()) as { error?: unknown; message?: unknown };
          if (typeof body.message === "string") {
            message = body.message;
          } else if (typeof body.error === "string") {
            message = body.error;
          }
        } catch {
          // Keep the status message when the response is not JSON.
        }
        setError(message);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const json = dataLine.slice(6);
          try {
            const event = JSON.parse(json);
            handleEvent(event);
          } catch {
            // ignore malformed frames
          }
        }
      }
    } catch (err) {
      setError((err as Error).message ?? "Stream failed.");
    } finally {
      streamStarted = false;
    }
  }

  function handleEvent(event: { type: string } & Record<string, unknown>) {
    switch (event.type) {
      case "meta": {
        if (typeof event.program_name === "string") {
          setProgramName(event.program_name);
          setStatus(`Designing ${event.program_name}...`);
          setThoughts((prev) => [...prev, `Named the program "${event.program_name}"`]);
        }
        return;
      }
      case "node": {
        const incoming = event.node as IncomingNode;
        addNode(incoming);
        setThoughts((prev) => [
          ...prev,
          `Added ${incoming.type} node: ${incoming.label ?? incoming.id}`,
        ]);
        return;
      }
      case "edge": {
        const incoming = event.edge as IncomingEdge;
        addEdge(incoming);
        setThoughts((prev) => [
          ...prev,
          `Connected ${incoming.from} → ${incoming.to}`,
        ]);
        return;
      }
      case "status": {
        if (typeof event.message === "string") setStatus(event.message);
        return;
      }
      case "done": {
        const programId = event.program_id as string;
        setStatus("Opening your program...");
        router.replace(`/programs/${programId}`);
        return;
      }
      case "error": {
        setError(typeof event.message === "string" ? event.message : "Generation failed.");
        return;
      }
    }
  }

  return (
    <div className="fixed inset-y-0 left-16 right-0 z-10 bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
      </ReactFlow>

      {/* Status overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-6">
        <div className="pointer-events-auto max-w-lg w-full mx-4 rounded-xl border glass-card px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            {!error && <Spinner />}
            <div className="flex-1 min-w-0">
              {programName && (
                <p className="text-sm font-semibold truncate">{programName}</p>
              )}
              <p className="text-xs text-muted-foreground truncate">
                {error ? "Generation failed" : status}
              </p>
            </div>
          </div>
          {error && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-destructive">{error}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => router.replace("/programs/new")}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Thoughts panel */}
      {thoughts.length > 0 && !error && (
        <div className="pointer-events-auto absolute left-4 bottom-4 z-10 max-w-sm rounded-xl border glass-card px-4 py-3 shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Thinking through the build
          </p>
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {thoughts.slice(-8).map((thought, i) => (
              <div
                key={`${thought}-${i}`}
                className="flex gap-2 text-xs text-muted-foreground animate-in fade-in slide-in-from-left-2 duration-300"
              >
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span>{thought}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function relayout(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): ReactFlowNode[] {
  if (nodes.length === 0) return nodes;
  return applyDagreLayout(nodes, edges, "TB");
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
