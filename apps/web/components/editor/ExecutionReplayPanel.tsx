"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  PlayIcon,
  PauseIcon,
  StepForwardIcon,
  StepBackIcon,
  RotateCcwIcon,
  XIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  DollarSignIcon,
  ZapIcon,
  HistoryIcon,
  ChevronDownIcon,
  Loader2Icon,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PastRun {
  id: string;
  status: string;
  triggered_by: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  total_tokens: number;
  estimated_cost_usd: number;
  created_at: string;
}

interface NodeExecutionData {
  node_id: string;
  status: string;
  input_payload: unknown;
  output_payload: unknown;
  error_message: string | null;
  retry_count: number | null;
  started_at: string | null;
  completed_at: string | null;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  connector_api_calls: number;
  model_call_count: number;
  created_at: string;
}

interface RunData {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  triggered_by: string;
  trigger_payload: unknown;
  error_message: string | null;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  connector_api_calls: number;
  model_call_count: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const d = Math.max(0, e - s);
  if (d < 1000) return `${d}ms`;
  if (d < 60_000) return `${(d / 1000).toFixed(1)}s`;
  return `${Math.floor(d / 60_000)}m ${Math.floor((d % 60_000) / 1000)}s`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function fmt(n: number): string {
  return new Intl.NumberFormat().format(n);
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(n);
}

// ─── Status helpers ─────────────────────────────────────────────────────────

function statusEmoji(status: string): string {
  switch (status) {
    case "completed":
    case "success":
      return "🟢";
    case "running":
      return "🟡";
    case "failed":
      return "🔴";
    case "pending":
    case "idle":
    default:
      return "⚪";
  }
}

function getStatusConfig(status: string) {
  switch (status) {
    case "completed":
    case "success":
      return { color: "bg-green-500", text: "text-green-600", icon: CheckCircleIcon };
    case "running":
      return { color: "bg-blue-500", text: "text-blue-600", icon: ZapIcon };
    case "failed":
      return { color: "bg-red-500", text: "text-red-600", icon: AlertCircleIcon };
    default:
      return { color: "bg-gray-400", text: "text-gray-600", icon: ClockIcon };
  }
}

// ─── JSON viewer ────────────────────────────────────────────────────────────

function JsonViewer({ label, data }: { label: string; data: unknown }) {
  if (data == null) return null;
  return (
    <details className="mt-1">
      <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none">
        {label}
      </summary>
      <pre className="mt-1 p-2 rounded bg-muted/60 text-[11px] overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface ExecutionReplayPanelProps {
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
  /** Called when user steps through — receives node_id → status map for visual overlay */
  onNodeStatusUpdate?: (nodeStatuses: Record<string, string>) => void;
}

// ─── ExecutionReplayPanel ──────────────────────────────────────────────────

export function ExecutionReplayPanel({
  programId,
  programSchema,
  onClose,
  onNodeStatusUpdate,
}: ExecutionReplayPanelProps) {
  const [pastRuns, setPastRuns] = useState<PastRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runData, setRunData] = useState<RunData | null>(null);
  const [nodeExecutions, setNodeExecutions] = useState<NodeExecutionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [autoStep, setAutoStep] = useState(false);
  const [stepSpeed, setStepSpeed] = useState(800);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runSelectorOpen, setRunSelectorOpen] = useState(false);
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch past runs on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoadingRuns(true);
        const res = await fetch(`/api/programs/${programId}/past-runs`);
        if (!res.ok) throw new Error("Failed to fetch past runs");
        const data = await res.json();
        if (!cancelled) setPastRuns(data.runs ?? []);
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setLoadingRuns(false);
      }
    })();
    return () => { cancelled = true; };
  }, [programId]);

  // Fetch execution data when a run is selected
  const loadRunData = useCallback(async (runId: string) => {
    setLoading(true);
    setSelectedRunId(runId);
    setCurrentStepIndex(-1);
    setAutoStep(false);
    setSelectedNodeId(null);
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    try {
      const res = await fetch(`/api/programs/${programId}/runs/${runId}/execution-data`);
      if (!res.ok) throw new Error("Failed to fetch execution data");
      const data = await res.json();
      setRunData(data.run);
      setNodeExecutions(data.node_executions ?? []);
    } catch {
      setRunData(null);
      setNodeExecutions([]);
    } finally {
      setLoading(false);
    }
  }, [programId]);

  // Sort executions by created_at to build ordered steps
  const executionSteps = React.useMemo(() => {
    return [...nodeExecutions].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
  }, [nodeExecutions]);

  // Build node definitions map
  const nodeDefinitionsMap = React.useMemo(() => {
    const map: Record<string, { label: string; type: string }> = {};
    for (const node of programSchema.nodes) {
      map[node.id] = { label: node.label, type: node.type };
    }
    return map;
  }, [programSchema.nodes]);

  // Current step
  const currentStep = currentStepIndex >= 0 ? executionSteps[currentStepIndex] : null;
  const currentNodeDef = currentStep ? nodeDefinitionsMap[currentStep.node_id] : null;

  // Determine which nodes are "active" up to the current step
  const activeNodeStatuses = React.useMemo(() => {
    const statuses: Record<string, string> = {};
    const stepsToShow = currentStepIndex >= 0 ? executionSteps.slice(0, currentStepIndex + 1) : [];
    for (const step of stepsToShow) {
      statuses[step.node_id] = step.status;
    }
    return statuses;
  }, [currentStepIndex, executionSteps]);

  // Notify parent of node status changes for visual overlay
  useEffect(() => {
    onNodeStatusUpdate?.(activeNodeStatuses);
  }, [activeNodeStatuses, onNodeStatusUpdate]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, []);

  // Step controls
  const stepForward = useCallback(() => {
    setCurrentStepIndex((i) => Math.min(i + 1, executionSteps.length - 1));
  }, [executionSteps.length]);

  const stepBackward = useCallback(() => {
    setCurrentStepIndex((i) => Math.max(i - 1, -1));
  }, []);

  const resetSteps = useCallback(() => {
    setCurrentStepIndex(-1);
    setAutoStep(false);
    setSelectedNodeId(null);
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  const playPause = useCallback(() => {
    if (autoStep) {
      setAutoStep(false);
      if (stepTimerRef.current) {
        clearInterval(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    } else {
      // If at end, reset to start
      if (currentStepIndex >= executionSteps.length - 1) {
        setCurrentStepIndex(-1);
      }
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
  }, [autoStep, executionSteps.length, stepSpeed, currentStepIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!selectedRunId || executionSteps.length === 0) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          playPause();
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
            resetSteps();
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
  }, [selectedRunId, executionSteps.length, playPause, stepForward, stepBackward, resetSteps, onClose]);

  const progressPercent =
    executionSteps.length > 0 && currentStepIndex >= 0
      ? Math.round(((currentStepIndex + 1) / executionSteps.length) * 100)
      : 0;

  const selectedRun = pastRuns.find((r) => r.id === selectedRunId);

  // Compute aggregate cost/tokens for the run
  const totalCost = nodeExecutions.reduce((sum, e) => sum + (e.estimated_cost_usd ?? 0), 0);
  const totalTokens = nodeExecutions.reduce((sum, e) => sum + (e.total_tokens ?? 0), 0);

  return (
    <div className="flex h-full bg-background border-l border-border overflow-hidden">
      {/* ─── Left: Timeline Panel ─────────────────────────────────── */}
      <div className="w-72 border-r border-border flex flex-col overflow-hidden shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-emerald-500" />
            <div>
              <h3 className="font-semibold text-sm">Replay</h3>
              <p className="text-[10px] text-muted-foreground">Read-only execution review</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Run selector */}
        <div className="px-3 py-2 border-b border-border shrink-0">
          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            Select run
          </label>
          <div className="relative mt-1">
            <button
              onClick={() => setRunSelectorOpen(!runSelectorOpen)}
              className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-left hover:bg-accent transition-colors"
              disabled={loadingRuns}
            >
              <span className="truncate">
                {loadingRuns
                  ? "Loading runs…"
                  : selectedRun
                    ? `${selectedRun.status.toUpperCase()} — ${formatDateTime(selectedRun.started_at)}`
                    : pastRuns.length === 0
                      ? "No past runs"
                      : "Choose a run…"}
              </span>
              <ChevronDownIcon className={cn("h-3.5 w-3.5 shrink-0 transition-transform", runSelectorOpen && "rotate-180")} />
            </button>

            {runSelectorOpen && pastRuns.length > 0 && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setRunSelectorOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-popover shadow-md max-h-60 overflow-y-auto">
                  {pastRuns.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => {
                        setRunSelectorOpen(false);
                        void loadRunData(run.id);
                      }}
                      className={cn(
                        "w-full text-left px-2.5 py-2 text-xs hover:bg-accent transition-colors border-b border-border last:border-0",
                        selectedRunId === run.id && "bg-primary/10"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">
                          {statusEmoji(run.status)} {run.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {run.triggered_by}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateTime(run.started_at)}
                        </span>
                        {run.estimated_cost_usd > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {fmtUsd(run.estimated_cost_usd)}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground/60 font-mono">
                        {run.id.slice(0, 8)}…
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Controls Bar */}
        {selectedRunId && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <div className="flex items-center gap-0.5">
              <Button
                variant="outline"
                size="icon"
                onClick={resetSteps}
                disabled={executionSteps.length === 0 || currentStepIndex === -1}
                className="h-7 w-7"
                title="Reset (R)"
              >
                <RotateCcwIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={stepBackward}
                disabled={currentStepIndex <= -1}
                className="h-7 w-7"
                title="Step back (←)"
              >
                <StepBackIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={autoStep ? "default" : "outline"}
                size="icon"
                onClick={playPause}
                disabled={executionSteps.length === 0}
                className="h-7 w-7"
                title={autoStep ? "Pause (Space)" : "Play (Space)"}
              >
                {autoStep ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={stepForward}
                disabled={currentStepIndex >= executionSteps.length - 1}
                className="h-7 w-7"
                title="Step forward (→)"
              >
                <StepForwardIcon className="h-3.5 w-3.5" />
              </Button>
            </div>

            {executionSteps.length > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {currentStepIndex >= 0 ? currentStepIndex + 1 : "—"}/{executionSteps.length}
              </span>
            )}
          </div>
        )}

        {/* Progress Bar */}
        {selectedRunId && executionSteps.length > 0 && (
          <div className="px-3 py-1.5 border-b border-border shrink-0">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  runData?.status === "completed" || runData?.status === "success"
                    ? "bg-green-500"
                    : runData?.status === "failed"
                      ? "bg-red-500"
                      : "bg-blue-500"
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Execution Steps List */}
        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {loading ? (
              <div className="text-center py-10 text-muted-foreground">
                <Loader2Icon className="h-6 w-6 mx-auto mb-2 animate-spin opacity-40" />
                <p className="text-xs">Loading execution data…</p>
              </div>
            ) : executionSteps.length > 0 ? (
              executionSteps.map((step, index) => {
                const config = getStatusConfig(step.status);
                const isCurrent = index === currentStepIndex;
                const isBeforeCurrent = index <= currentStepIndex;
                const nodeInfo = nodeDefinitionsMap[step.node_id];
                const IconComponent = config.icon;
                const isSelected = selectedNodeId === step.node_id;

                return (
                  <button
                    key={`${step.node_id}-${index}`}
                    onClick={() => {
                      setCurrentStepIndex(index);
                      setSelectedNodeId(step.node_id);
                    }}
                    className={cn(
                      "w-full text-left px-2.5 py-2 rounded-md transition-all group",
                      isCurrent
                        ? "bg-primary/10 border border-primary/30"
                        : isSelected
                          ? "bg-accent border border-border"
                          : "hover:bg-muted/50 border border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {/* Step number */}
                      <span
                        className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 transition-colors",
                          isCurrent
                            ? "bg-primary text-primary-foreground"
                            : isBeforeCurrent
                              ? config.color + " text-white"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {index + 1}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <IconComponent
                            className={cn(
                              "h-3 w-3 flex-shrink-0",
                              isBeforeCurrent ? config.text : "text-muted-foreground"
                            )}
                          />
                          <span className={cn(
                            "text-xs font-medium truncate",
                            !isBeforeCurrent && "text-muted-foreground"
                          )}>
                            {nodeInfo?.label || step.node_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {step.started_at && step.completed_at && (
                            <span className="text-[9px] text-muted-foreground">
                              {formatDuration(step.started_at, step.completed_at)}
                            </span>
                          )}
                          {step.estimated_cost_usd > 0 && (
                            <Badge variant="secondary" className="text-[8px] h-3 px-1">
                              ${step.estimated_cost_usd.toFixed(4)}
                            </Badge>
                          )}
                          {step.total_tokens > 0 && (
                            <Badge variant="secondary" className="text-[8px] h-3 px-1">
                              {step.total_tokens} tok
                            </Badge>
                          )}
                        </div>
                      </div>

                      {step.error_message && (
                        <AlertCircleIcon className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
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
            ) : selectedRunId ? (
              <div className="text-center py-10 text-muted-foreground">
                <ClockIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-medium">No node executions</p>
                <p className="text-[10px] mt-1">This run has no recorded execution data</p>
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <HistoryIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-medium">Select a run to replay</p>
                <p className="text-[10px] mt-1">Step through past execution data</p>
                <p className="text-[10px] mt-0.5 text-muted-foreground/60">
                  Read-only · Zero cost
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Summary footer */}
        {selectedRunId && runData && (
          <div className="border-t border-border shrink-0">
            <div className="px-3 py-2 border-b border-border">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold text-primary tabular-nums">
                    {totalCost.toFixed(4)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">Cost</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-blue-600 tabular-nums">
                    {fmt(totalTokens)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">Tokens</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-green-600 tabular-nums">
                    {formatDuration(runData.started_at, runData.completed_at)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">Duration</div>
                </div>
              </div>
              <Badge
                variant={
                  runData.status === "completed" || runData.status === "success"
                    ? "default"
                    : runData.status === "failed"
                      ? "destructive"
                      : "secondary"
                }
                className="w-full mt-2 justify-center text-[10px]"
              >
                {runData.status.toUpperCase()}
              </Badge>
            </div>

            {/* Speed control */}
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Speed:</span>
              <select
                value={stepSpeed}
                onChange={(e) => setStepSpeed(Number(e.target.value))}
                className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-background"
              >
                <option value={1500}>0.5×</option>
                <option value={800}>1×</option>
                <option value={400}>2×</option>
                <option value={200}>4×</option>
              </select>
              <span className="text-[10px] text-muted-foreground ml-auto">
                ← → Space R
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Right: Node Detail Inspector ──────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentStep ? (
          <div className="flex flex-col h-full">
            {/* Inspector header */}
            <div className="px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">{statusEmoji(currentStep.status)}</span>
                <div>
                  <h4 className="text-sm font-semibold">
                    {currentNodeDef?.label || currentStep.node_id}
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    {currentNodeDef?.type ?? "unknown"} · Step {(currentStepIndex ?? 0) + 1} of {executionSteps.length}
                  </p>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Status & Timing */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p className="mt-0.5 font-medium">{currentStep.status.replace(/_/g, " ")}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duration</span>
                    <p className="mt-0.5 font-medium">
                      {formatDuration(currentStep.started_at, currentStep.completed_at)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Started</span>
                    <p className="mt-0.5 font-medium">{formatDateTime(currentStep.started_at)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Completed</span>
                    <p className="mt-0.5 font-medium">{formatDateTime(currentStep.completed_at)}</p>
                  </div>
                </div>

                {/* Token & Cost breakdown */}
                {(currentStep.total_tokens > 0 || currentStep.estimated_cost_usd > 0) && (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Cost Breakdown
                    </h5>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <div className="font-bold tabular-nums">{fmt(currentStep.total_tokens)}</div>
                        <div className="text-[9px] text-muted-foreground">Total tokens</div>
                      </div>
                      <div>
                        <div className="font-bold tabular-nums">{fmt(currentStep.prompt_tokens)}</div>
                        <div className="text-[9px] text-muted-foreground">Input</div>
                      </div>
                      <div>
                        <div className="font-bold tabular-nums">{fmt(currentStep.completion_tokens)}</div>
                        <div className="text-[9px] text-muted-foreground">Output</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs border-t border-border pt-2">
                      <div className="flex items-center gap-1">
                        <DollarSignIcon className="h-3 w-3 text-primary" />
                        <span className="font-medium">{fmtUsd(currentStep.estimated_cost_usd)}</span>
                      </div>
                      {currentStep.connector_api_calls > 0 && (
                        <span className="text-muted-foreground">
                          {currentStep.connector_api_calls} API call{currentStep.connector_api_calls !== 1 ? "s" : ""}
                        </span>
                      )}
                      {currentStep.model_call_count > 0 && (
                        <span className="text-muted-foreground">
                          {currentStep.model_call_count} model call{currentStep.model_call_count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Retry info */}
                {currentStep.retry_count != null && currentStep.retry_count > 0 && (
                  <div className="rounded border border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2">
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      ⟳ Retried {currentStep.retry_count}×
                    </p>
                  </div>
                )}

                {/* Error */}
                {currentStep.error_message && (
                  <div className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2">
                    <p className="text-xs font-semibold text-destructive mb-1">Error</p>
                    <p className="text-[11px] text-destructive whitespace-pre-wrap break-words leading-relaxed">
                      {currentStep.error_message}
                    </p>
                  </div>
                )}

                {/* Input payload */}
                <div className="rounded-lg border border-border p-3">
                  <JsonViewer label="▸ Input Payload" data={currentStep.input_payload} />
                  {currentStep.input_payload == null && (
                    <p className="text-[11px] text-muted-foreground">No input data</p>
                  )}
                </div>

                {/* Output payload */}
                <div className="rounded-lg border border-border p-3">
                  <JsonViewer label="▸ Output Payload" data={currentStep.output_payload} />
                  {currentStep.output_payload == null && (
                    <p className="text-[11px] text-muted-foreground">No output data</p>
                  )}
                </div>

                {/* Node-level summary */}
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Node Info
                  </h5>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Node ID</span>
                      <p className="mt-0.5 font-mono text-[10px] break-all">{currentStep.node_id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Node Type</span>
                      <p className="mt-0.5">{currentNodeDef?.type ?? "—"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <ZapIcon className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Select a step to inspect</p>
              <p className="text-xs mt-1">Use the timeline controls to step through the execution</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
