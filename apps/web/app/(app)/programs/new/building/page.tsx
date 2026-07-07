"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  useGenesisJob,
  type GenesisJobNode,
  type GenesisJobEdge,
} from "@/components/genesis/genesis-job-provider";
import { GenesisQuestionPanel } from "@/components/genesis/question-panel";

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

export default function BuildingPage() {
  return (
    <ReactFlowProvider>
      <BuildingCanvas />
    </ReactFlowProvider>
  );
}

function toRfNode(
  incoming: GenesisJobNode,
  questionByNode?: Map<string, string>,
  blockedNodeIds?: Set<string>
): ReactFlowNode {
  return {
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
      genesisQuestion: questionByNode?.get(incoming.id) ?? null,
    },
    ...(blockedNodeIds?.has(incoming.id) ? { className: "genesis-blocked" } : {}),
    draggable: false,
    selectable: false,
  };
}

function toRfEdge(incoming: GenesisJobEdge): ReactFlowEdge {
  return {
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
}

// Genesis failures can surface as a raw stringified Zod issue array — extract
// the human-readable messages instead of showing JSON to the user.
function humanizeError(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const messages = parsed
        .map((issue) =>
          issue && typeof issue === "object" && typeof issue.message === "string"
            ? issue.message
            : null
        )
        .filter((m): m is string => Boolean(m));
      if (messages.length > 0) return messages.join(" ");
    }
  } catch {
    // not JSON — show as-is
  }
  return raw;
}

function BuildingCanvas() {
  const router = useRouter();
  const rf = useReactFlow();
  const { job, clear, applyClarificationResult } = useGenesisJob();
  const [answerBusyNodeId, setAnswerBusyNodeId] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [questionsDismissed, setQuestionsDismissed] = useState(false);

  // Track whether we ever had a job so a brief render gap (start() → navigate)
  // doesn't bounce us straight back to /programs/new.
  const sawJobRef = useRef(false);
  if (job) sawJobRef.current = true;

  // No job to show (direct visit / refresh — the in-memory stream is gone).
  useEffect(() => {
    if (job) return;
    const t = setTimeout(() => {
      if (!sawJobRef.current) router.replace("/programs/new");
    }, 400);
    return () => clearTimeout(t);
  }, [job, router]);

  // When the generation finishes while the user is watching, open the program —
  // unless it raised clarifying questions: those anchor to the canvas right
  // here, and answering (or dismissing) is what releases the navigation. The
  // session persists server-side either way, so leaving loses nothing.
  const hasOpenQuestions =
    (job?.clarifications.length ?? 0) > 0 && !questionsDismissed;
  useEffect(() => {
    if (job?.done && job.programId && !hasOpenQuestions && answerBusyNodeId === null) {
      const id = job.programId;
      clear();
      router.replace(`/programs/${id}`);
    }
  }, [job?.done, job?.programId, hasOpenQuestions, answerBusyNodeId, clear, router]);

  const handleAnswer = useCallback(
    async (nodeId: string, answer: string) => {
      if (!job?.sessionId) return;
      setAnswerBusyNodeId(nodeId);
      setAnswerError(null);
      try {
        const res = await fetch(`/api/genesis/sessions/${job.sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ node_id: nodeId, answer, ...job.keyContext }),
        });
        const body = (await res.json().catch(() => null)) as {
          schema?: { nodes?: GenesisJobNode[]; edges?: GenesisJobEdge[] };
          remaining_clarifications?: Array<{ node_id: string; question: string; blocked_node_ids: string[] }>;
          message?: string;
          error?: string;
        } | null;
        if (!res.ok || !body?.schema) {
          setAnswerError(body?.message ?? body?.error ?? "The answer could not be applied. Please try again.");
          return;
        }
        applyClarificationResult(
          (body.schema.nodes ?? []) as GenesisJobNode[],
          (body.schema.edges ?? []) as GenesisJobEdge[],
          body.remaining_clarifications ?? []
        );
      } catch {
        setAnswerError("We could not connect. Check your internet connection and try again.");
      } finally {
        setAnswerBusyNodeId(null);
      }
    },
    [job?.sessionId, job?.keyContext, applyClarificationResult]
  );

  const { nodes, edges } = useMemo(() => {
    const questionByNode = new Map(
      (job?.clarifications ?? []).map((c) => [c.node_id, c.question])
    );
    const blockedNodeIds = new Set(
      (job?.clarifications ?? []).flatMap((c) => c.blocked_node_ids)
    );
    const rfNodes = (job?.nodes ?? []).map((n) => toRfNode(n, questionByNode, blockedNodeIds));
    const rfEdges = (job?.edges ?? []).map(toRfEdge);
    return {
      nodes: rfNodes.length > 0 ? applyDagreLayout(rfNodes, rfEdges, "TB") : rfNodes,
      edges: rfEdges,
    };
  }, [job?.nodes, job?.edges, job?.clarifications]);

  // Refit the view as nodes stream in. fitView's own transition handles smoothness.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        rf.fitView({ padding: 0.2, duration: 400 });
      } catch {
        // no-op if canvas not ready
      }
    }, 450);
    return () => clearTimeout(t);
  }, [nodes.length, rf]);

  const programName = job?.programName ?? "";
  const error = job?.error ?? null;
  const status = job?.status ?? "Contacting the model...";
  const thoughts = job?.thoughts ?? [];

  return (
    <div className="fixed inset-y-0 left-0 right-0 z-10 bg-background lg:left-16">
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
            {!error && !job?.done && <Spinner />}
            <div className="flex-1 min-w-0">
              {programName && (
                <p className="text-sm font-semibold truncate">{programName}</p>
              )}
              <p className="text-xs text-muted-foreground truncate">
                {error ? "Generation failed" : status}
              </p>
            </div>
            {!error && !job?.done && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => router.push("/dashboard")}
              >
                Continue in background
              </Button>
            )}
            {!error && job?.done && hasOpenQuestions && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setQuestionsDismissed(true)}
              >
                Skip questions — open program
              </Button>
            )}
          </div>
          {error && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-destructive">{humanizeError(error)}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    clear();
                    router.replace("/programs/new");
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Clarifying questions — anchored to their nodes via pins; answered here */}
      {job?.done && hasOpenQuestions && !error && (
        <div className="absolute right-4 top-24 z-10">
          <GenesisQuestionPanel
            clarifications={job.clarifications}
            nodeLabels={new Map((job.nodes ?? []).map((n) => [n.id, n.label ?? n.id]))}
            busyNodeId={answerBusyNodeId}
            onAnswer={handleAnswer}
            onDismiss={() => setQuestionsDismissed(true)}
            error={answerError}
          />
        </div>
      )}

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

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
