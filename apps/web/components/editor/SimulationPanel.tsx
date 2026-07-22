"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  PlayIcon,
  PauseIcon,
  StepForwardIcon,
  RotateCcwIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  DollarSignIcon,
  ZapIcon,
} from "lucide-react";

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
  total_estimated_cost_usd: number;
  total_estimated_tokens: number;
}

interface NodeSimulationState {
  node_id: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number;
  estimated_cost_usd: number;
  estimated_tokens: number;
  is_mock: boolean;
}

interface SimulationPanelProps {
  programId: string;
  programSchema: {
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      position: { x: number; y: number };
      status: string;
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
  const [isPaused, setIsPaused] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(true);
  const [triggerPayload, setTriggerPayload] = useState<Record<string, unknown>>(
    initialTriggerPayload || {}
  );
  const [triggerPayloadText, setTriggerPayloadText] = useState(
    JSON.stringify(initialTriggerPayload || {}, null, 2)
  );
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [autoStep, setAutoStep] = useState(false);
  const [stepSpeed, setStepSpeed] = useState(500); // ms per step

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

  // Handle node click in canvas
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

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
    setSelectedNodeId(null);
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    setIsPaused(false);
  }, []);

  const playPause = useCallback(() => {
    if (autoStep) {
      setAutoStep(false);
      setIsPaused(true);
      if (stepTimerRef.current) {
        clearInterval(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    } else {
      setAutoStep(true);
      setIsPaused(false);
      stepTimerRef.current = setInterval(() => {
        if (currentStepIndex < executionSteps.length - 1) {
          setCurrentStepIndex((i) => i + 1);
        } else {
          setAutoStep(false);
          if (stepTimerRef.current) {
            clearInterval(stepTimerRef.current);
            stepTimerRef.current = null;
          }
        }
      }, stepSpeed);
    }
  }, [autoStep, currentStepIndex, executionSteps.length, stepSpeed]);

  const handleRunSimulation = useCallback(async () => {
    setIsRunning(true);
    try {
      const payload = parseTriggerPayload();
      const result = await onRunSimulation(payload);
      setSimulationResult(result);
      setCurrentStepIndex(0);
      setSelectedNodeId(null);
      setAutoStep(false);
      setIsPaused(false);
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

  // Get status color and icon
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

  // Format JSON for display
  const formatJson = (obj: Record<string, unknown>) => {
    return JSON.stringify(obj, null, 2);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <XIcon className="h-4 w-4" />
          </Button>
          <div>
            <h3 className="font-semibold text-sm">Simulation Mode</h3>
            <p className="text-xs text-muted-foreground">Visual dry-run with mock data</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Trigger Payload Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInput(!showInput)}
            className={cn(showInput && "bg-primary/10 border-primary/40 text-primary")}
          >
            <SearchIcon className="h-3.5 w-3.5 mr-1" />
            Trigger Input
          </Button>

          {/* Simulation Controls */}
          <div className="flex items-center gap-1 border-l border-border pl-2 ml-2">
            <Button
              variant="outline"
              size="icon"
              onClick={resetSimulation}
              disabled={!simulationResult}
              className="h-7 w-7"
              title="Reset simulation"
            >
              <RotateCcwIcon className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={stepBackward}
              disabled={!simulationResult || currentStepIndex === 0}
              className="h-7 w-7"
              title="Step back"
            >
              <ChevronUpIcon className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant={autoStep ? "default" : "outline"}
              size="icon"
              onClick={playPause}
              disabled={!simulationResult || executionSteps.length === 0}
              className="h-7 w-7"
              title={autoStep ? "Pause auto-step" : "Play auto-step"}
            >
              {autoStep ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={stepForward}
              disabled={!simulationResult || currentStepIndex >= executionSteps.length - 1}
              className="h-7 w-7"
              title="Step forward"
            >
              <StepForwardIcon className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Run Simulation Button */}
          <Button
            size="sm"
            onClick={handleRunSimulation}
            disabled={isRunning}
            className="gap-1.5 ml-2"
          >
            <ZapIcon className="h-3.5 w-3.5" />
            {isRunning ? "Running..." : "Run Simulation"}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Execution Timeline */}
        <div className="w-80 border-r border-border bg-background flex flex-col overflow-hidden">
          {/* Trigger Input Panel */}
          {showInput && (
            <div className="p-3 border-b border-border">
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Trigger Payload</h4>
              <textarea
                value={triggerPayloadText}
                onChange={(e) => setTriggerPayloadText(e.target.value)}
                className="w-full h-24 font-mono text-xs rounded border border-border bg-background p-2 resize-none"
                placeholder='{"key": "value"}'
                spellCheck={false}
              />
            </div>
          )}

          {/* Execution Steps List */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {simulationResult ? (
                executionSteps.map((step, index) => {
                  const config = getStatusConfig(step.status);
                  const isCurrent = index === currentStepIndex;
                  const isSelected = selectedNodeId === step.node_id;
                  const nodeInfo = programSchema.nodes.find((n) => n.id === step.node_id);

                  return (
                    <button
                      key={step.node_id}
                      onClick={() => setCurrentStepIndex(index)}
                      className={cn(
                        "w-full text-left p-2 rounded transition-all",
                        isCurrent && "bg-primary/10 border border-primary/40",
                        isSelected && !isCurrent && "bg-accent",
                        "hover:bg-accent/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            config.color
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-medium truncate">{nodeInfo?.label || step.node_id}</span>
                            {step.estimated_cost_usd > 0 && (
                              <Badge variant="secondary" className="text-[9px] h-3.5 px-1.5">
                                <DollarSignIcon className="h-2.5 w-2.5 mr-0.5" />
                                ${step.estimated_cost_usd.toFixed(4)}
                              </Badge>
                            )}
                            {step.estimated_tokens > 0 && (
                              <Badge variant="secondary" className="text-[9px] h-3.5 px-1.5">
                                <ZapIcon className="h-2.5 w-2.5 mr-0.5" />
                                {step.estimated_tokens} tok
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {step.node_id}
                          </div>
                        </div>
                        {step.error_message && (
                          <AlertCircleIcon className="h-3 w-3 text-red-500" title={step.error_message} />
                        )}
                      </div>
                      {isCurrent && (
                        <div className="mt-1 text-[10px] text-primary font-medium">
                          ▶ Current Step
                        </div>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <ZapIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>Run a simulation to see execution steps</p>
                  <p className="text-xs mt-1">Mock data will be used for all connectors</p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Summary */}
          {simulationResult && (
            <div className="p-3 border-t border-border bg-background/50">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-primary">{simulationResult.total_estimated_cost_usd.toFixed(4)}</div>
                  <div className="text-[10px] text-muted-foreground">Est. Cost</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-600">{simulationResult.total_estimated_tokens}</div>
                  <div className="text-[10px] text-muted-foreground">Est. Tokens</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-600">{simulationResult.total_duration_ms.toFixed(0)}ms</div>
                  <div className="text-[10px] text-muted-foreground">Duration</div>
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
                className="w-full mt-2 justify-center"
              >
                {simulationResult.status.toUpperCase()}
              </Badge>
            </div>
          )}
        </div>

        {/* Right Panel - State Inspector */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentStep ? (
            <>
              <div className="p-3 border-b border-border bg-background/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{programSchema.nodes.find((n) => n.id === currentStep.node_id)?.label || currentStep.node_id}</h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn("flex items-center gap-1", getStatusConfig(currentStep.status).text)}>
                        {(() => {
                          const IconComponent = getStatusConfig(currentStep.status).icon;
                          return <IconComponent className="h-3 w-3" />;
                        })()}
                        {currentStep.status}
                      </span>
                      {currentStep.duration_ms > 0 && (
                        <span className="flex items-center gap-1">
                          <ClockIcon className="h-3 w-3" />
                          {currentStep.duration_ms.toFixed(1)}ms
                        </span>
                      )}
                    </div>
                  </div>
                  {currentStep.error_message && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircleIcon className="h-2.5 w-2.5 mr-0.5" />
                      Failed
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                <div className="h-full flex">
                  {/* Input Panel */}
                  <div className="w-1/2 border-r border-border overflow-hidden flex flex-col">
                    <div className="p-2 bg-background/50 border-b border-border">
                      <h5 className="text-xs font-medium text-muted-foreground">Input Data</h5>
                    </div>
                    <ScrollArea className="flex-1 p-2">
                      <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-words">
                        {formatJson(currentStep.input_data)}
                      </pre>
                    </ScrollArea>
                  </div>

                  {/* Output Panel */}
                  <div className="w-1/2 overflow-hidden flex flex-col">
                    <div className="p-2 bg-background/50 border-b border-border">
                      <h5 className="text-xs font-medium text-muted-foreground">Output Data</h5>
                    </div>
                    <ScrollArea className="flex-1 p-2">
                      <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-words">
                        {formatJson(currentStep.output_data)}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <ZapIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a step or run a simulation</p>
                <p className="text-xs mt-1">Click on a step in the timeline to inspect its input/output</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}