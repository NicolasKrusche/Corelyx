"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  PlayIcon,
  PauseIcon,
  StepForwardIcon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  DollarSignIcon,
  ZapIcon,
  ChevronLeftIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { StateInspector, type NodeSimulationState } from "./StateInspector";

// Re-export the types for consumers
export type { NodeSimulationState } from "./StateInspector";

// ─── Simulation Result Types ─────────────────────────────────────────────────

interface SimulationResult {
  program_id: string;
  simulation_id: string;
  status: "completed" | "failed" | "partial";
  started_at: string;
  completed_at: string | null;
  total_duration_ms: number;
  nodes: Record<string, NodeSimulationState>;
  edges_traversed: {
    edge_id: string;
    source: string;
    target: string;
    type: string;
    mapping: Record<string, unknown>;
  }[];
  errors: string[];
  total_billed_cost_usd: number;
  total_estimated_tokens: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SimulationPanelProps {
  programId: string;
  programSchema: {
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      position: { x: number; y: number };
      status: string;
      config?: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      from_node: string;
      to: string;
      type: string;
    }>;
  };
  onClose: () => void;
  onRunSimulation: (triggerPayload?: Record<string, unknown>) => Promise<SimulationResult>;
  initialTriggerPayload?: Record<string, unknown>;
}

export function SimulationPanel({
  programId,
  programSchema,
  onClose,
  onRunSimulation,
  initialTriggerPayload,
}: SimulationPanelProps) {
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showInput, setShowInput] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const [triggerPayload, setTriggerPayload] = useState<Record<string, unknown>>(
    initialTriggerPayload || {}
  );
  const [triggerPayloadText, setTriggerPayloadText] = useState(
    JSON.stringify(initialTriggerPayload || {}, null, 2)
  );
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [autoStep, setAutoStep] = useState(false);
  const [stepSpeed, setStepSpeed] = useState(500);

  // Parse trigger payload from text
  const parseTriggerPayload = useCallback(() => {
    try {
      const parsed = JSON.parse(triggerPayloadText);
      setTriggerPayload(parsed);
      return parsed;
    } catch {
      return triggerPayload;
    }
  }, [triggerPayloadText, triggerPayload]);

  // Get ordered execution steps from simulation result
  const executionSteps = React.useMemo(() => {
    if (!simulationResult) return [];
    return Object.values(simulationResult.nodes).sort((a, b) => {
      const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
      const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
      return aTime - bTime;
    });
  }, [simulationResult]);

  const currentStep = executionSteps[currentStepIndex];

  // Get node definition for current step
  const currentNodeDef = React.useMemo(() => {
    if (!currentStep) return null;
    return programSchema.nodes.find((n) => n.id === currentStep.node_id);
  }, [currentStep, programSchema.nodes]);

  // Build node definitions map for StateInspector
  const nodeDefinitionsMap = React.useMemo(() => {
    const map: Record<string, { label: string; type: string; connection?: string | null }> = {};
    for (const node of programSchema.nodes) {
      map[node.id] = {
        label: node.label,
        type: node.type,
        connection: (node.config as Record<string, unknown>)?.provider as string ?? null,
      };
    }
    return map;
  }, [programSchema.nodes]);

  // Step through simulation
  const stepForward = useCallback(() => {
    if (currentStepIndex < executionSteps.length - 1) {
      setCurrentStepIndex((i) => i + 1);
    }
  }, [currentStepIndex, executionSteps.length]);

  const stepBackward = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1);
    }
  }, [currentStepIndex]);

  const resetSimulation = useCallback(() => {
    setCurrentStepIndex(0);
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    setAutoStep(false);
  }, []);

  const playPause = useCallback(() => {
    if (autoStep) {
      setAutoStep(false);
      if (stepTimerRef.current) {
        clearInterval(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    } else {
      setAutoStep(true);
      stepTimerRef.current = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= executionSteps.length - 1) {
            setAutoStep(false);
            if (stepTimerRef.current) {
              clearInterval(stepTimerRef.current);
              stepTimerRef.current = null;
            }
            return prev;
          }
          return prev + 1;
        });
      }, stepSpeed);
    }
  }, [autoStep, executionSteps.length, stepSpeed]);

  const handleRunSimulation = useCallback(async () => {
    setIsRunning(true);
    try {
      const payload = parseTriggerPayload();
      const result = await onRunSimulation(payload);
      setSimulationResult(result);
      setCurrentStepIndex(0);
      setAutoStep(false);
    } catch (error) {
      console.error("Simulation failed:", error);
    } finally {
      setIsRunning(false);
    }
  }, [onRunSimulation, parseTriggerPayload]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) {
        clearInterval(stepTimerRef.current);
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (simulationResult) playPause();
          break;
        case "ArrowRight":
          e.preventDefault();
          stepForward();
          break;
        case "ArrowLeft":
          e.preventDefault();
          stepBackward();
          break;
        case "r":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            resetSimulation();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [simulationResult, playPause, stepForward, stepBackward, resetSimulation, onClose]);

  // Get status color
  const getStatusConfig = (status: NodeSimulationState["status"]) => {
    switch (status) {
      case "completed":
        return { color: "bg-green-500", text: "text-green-600", icon: CheckCircleIcon };
      case "running":
        return { color: "bg-blue-500", text: "text-blue-600", icon: ZapIcon };
      case "failed":
        return { color: "bg-red-500", text: "text-red-600", icon: AlertCircleIcon };
      case "pending":
        return { color: "bg-gray-400", text: "text-gray-600", icon: ClockIcon };
      case "skipped":
        return { color: "bg-amber-400", text: "text-amber-600", icon: ClockIcon };
      default:
        return { color: "bg-gray-400", text: "text-gray-600", icon: ClockIcon };
    }
  };

  const progressPercent =
    executionSteps.length > 0
      ? Math.round(((currentStepIndex + 1) / executionSteps.length) * 100)
      : 0;

  return (
    <div className="flex h-full bg-background border-l border-border overflow-hidden">
      {/* ─── Left: Timeline Panel ─────────────────────────────────── */}
      <div className="w-72 border-r border-border flex flex-col overflow-hidden shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ZapIcon className="h-4 w-4 text-purple" />
            <div>
              <h3 className="font-semibold text-sm">Simulation</h3>
              <p className="text-[10px] text-muted-foreground">Visual dry-run</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-0.5">
            <Button
              variant="outline"
              size="icon"
              onClick={resetSimulation}
              disabled={!simulationResult}
              className="h-7 w-7"
              title="Reset (R)"
            >
              <RotateCcwIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={stepBackward}
              disabled={!simulationResult || currentStepIndex === 0}
              className="h-7 w-7"
              title="Step back (←)"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={autoStep ? "default" : "outline"}
              size="icon"
              onClick={playPause}
              disabled={!simulationResult || executionSteps.length === 0}
              className="h-7 w-7"
              title={autoStep ? "Pause (Space)" : "Play (Space)"}
            >
              {autoStep ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={stepForward}
              disabled={!simulationResult || currentStepIndex >= executionSteps.length - 1}
              className="h-7 w-7"
              title="Step forward (→)"
            >
              <StepForwardIcon className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Step counter */}
          {simulationResult && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {currentStepIndex + 1}/{executionSteps.length}
            </span>
          )}
        </div>

        {/* Progress Bar */}
        {simulationResult && (
          <div className="px-3 py-1.5 border-b border-border shrink-0">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  simulationResult.status === "completed"
                    ? "bg-green-500"
                    : simulationResult.status === "failed"
                    ? "bg-red-500"
                    : "bg-blue-500"
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Trigger Input Toggle */}
        <div className="px-3 py-2 border-b border-border shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInput(!showInput)}
            className={cn(
              "w-full justify-start text-xs h-7",
              showInput && "bg-primary/10 text-primary"
            )}
          >
            <SearchIcon className="h-3 w-3 mr-1.5" />
            Trigger Payload
            {showInput ? "▾" : "▸"}
          </Button>
          {showInput && (
            <div className="mt-2">
              <textarea
                value={triggerPayloadText}
                onChange={(e) => setTriggerPayloadText(e.target.value)}
                className="w-full h-20 font-mono text-[10px] rounded border border-border bg-background p-2 resize-none"
                placeholder='{"key": "value"}'
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Execution Steps List */}
        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {simulationResult ? (
              executionSteps.map((step, index) => {
                const config = getStatusConfig(step.status);
                const isCurrent = index === currentStepIndex;
                const nodeInfo = programSchema.nodes.find((n) => n.id === step.node_id);
                const IconComponent = config.icon;

                return (
                  <button
                    key={step.node_id}
                    onClick={() => setCurrentStepIndex(index)}
                    className={cn(
                      "w-full text-left px-2.5 py-2 rounded-md transition-all group",
                      isCurrent
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/50 border border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {/* Step number */}
                      <span
                        className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0",
                          isCurrent
                            ? "bg-primary text-primary-foreground"
                            : config.color + " text-white"
                        )}
                      >
                        {index + 1}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <IconComponent className={cn("h-3 w-3 flex-shrink-0", config.text)} />
                          <span className="text-xs font-medium truncate">
                            {nodeInfo?.label || step.node_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {step.duration_ms > 0 && (
                            <span className="text-[9px] text-muted-foreground">
                              {step.duration_ms < 1000
                                ? `${Math.round(step.duration_ms)}ms`
                                : `${(step.duration_ms / 1000).toFixed(1)}s`}
                            </span>
                          )}
                          {step.billed_cost_usd > 0 && (
                            <Badge variant="secondary" className="text-[8px] h-3 px-1">
                              ${step.billed_cost_usd.toFixed(4)}
                            </Badge>
                          )}
                          {step.estimated_tokens > 0 && (
                            <Badge variant="secondary" className="text-[8px] h-3 px-1">
                              {step.estimated_tokens} tok
                            </Badge>
                          )}
                        </div>
                      </div>

                      {step.error_message && (
                        <AlertCircleIcon
                          className="h-3.5 w-3.5 text-red-500 flex-shrink-0"
                        />
                      )}
                    </div>

                    {isCurrent && (
                      <div className="mt-1 text-[9px] text-primary font-medium pl-7">
                        ▸ Current Step
                      </div>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <ZapIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-medium">No simulation yet</p>
                <p className="text-[10px] mt-1">Click Run to start a visual dry-run</p>
                <p className="text-[10px] mt-0.5 text-muted-foreground/60">
                  Uses mock data for all connectors
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Run Button & Summary */}
        <div className="border-t border-border shrink-0">
          {simulationResult && (
            <div className="px-3 py-2 border-b border-border">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold text-primary tabular-nums">
                    {simulationResult.total_billed_cost_usd.toFixed(4)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">Cost</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-blue-600 tabular-nums">
                    {simulationResult.total_estimated_tokens}
                  </div>
                  <div className="text-[9px] text-muted-foreground">Tokens</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-green-600 tabular-nums">
                    {simulationResult.total_duration_ms < 1000
                      ? `${Math.round(simulationResult.total_duration_ms)}ms`
                      : `${(simulationResult.total_duration_ms / 1000).toFixed(1)}s`}
                  </div>
                  <div className="text-[9px] text-muted-foreground">Duration</div>
                </div>
              </div>
              <Badge
                variant={
                  simulationResult.status === "completed"
                    ? "default"
                    : simulationResult.status === "partial"
                    ? "secondary"
                    : "destructive"
                }
                className="w-full mt-2 justify-center text-[10px]"
              >
                {simulationResult.status.toUpperCase()}
              </Badge>
            </div>
          )}

          <div className="p-3">
            <Button
              size="sm"
              onClick={handleRunSimulation}
              disabled={isRunning}
              className="w-full gap-1.5"
            >
              <ZapIcon className="h-3.5 w-3.5" />
              {isRunning ? "Running..." : "Run Simulation"}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Right: State Inspector ───────────────────────────────── */}
      <StateInspector
        isOpen={showInspector}
        onClose={() => setShowInspector(false)}
        nodeState={currentStep ?? null}
        nodeLabel={currentNodeDef?.label}
        nodeType={currentNodeDef?.type}
        allNodeStates={simulationResult?.nodes}
        edges={programSchema.edges}
        nodeDefinitions={nodeDefinitionsMap}
      />
    </div>
  );
}
