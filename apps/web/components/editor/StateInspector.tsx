"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  XIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  DollarSignIcon,
  ZapIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  ChevronUpIcon,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NodeSimulationState {
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

export interface StateInspectorProps {
  /** The node state to display */
  nodeState: NodeSimulationState | null;
  /** Human-readable label for the node */
  nodeLabel?: string;
  /** The node type (trigger, connection, agent, step, etc.) */
  nodeType?: string;
  /** Whether the panel is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** All node states (for showing upstream/downstream context) */
  allNodeStates?: Record<string, NodeSimulationState>;
  /** All edges (for showing connections) */
  edges?: Array<{
    id: string;
    from_node: string;
    to: string;
    type: string;
  }>;
  /** Node definitions for labels */
  nodeDefinitions?: Record<
    string,
    { label: string; type: string; connection?: string | null }
  >;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatusConfig(status: NodeSimulationState["status"]) {
  switch (status) {
    case "completed":
      return {
        color: "bg-green-500",
        text: "text-green-600 dark:text-green-400",
        bg: "bg-green-50 dark:bg-green-950/30",
        border: "border-green-200 dark:border-green-800",
        icon: CheckCircleIcon,
        label: "Completed",
      };
    case "running":
      return {
        color: "bg-blue-500",
        text: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-50 dark:bg-blue-950/30",
        border: "border-blue-200 dark:border-blue-800",
        icon: ZapIcon,
        label: "Running",
      };
    case "failed":
      return {
        color: "bg-red-500",
        text: "text-red-600 dark:text-red-400",
        bg: "bg-red-50 dark:bg-red-950/30",
        border: "border-red-200 dark:border-red-800",
        icon: AlertCircleIcon,
        label: "Failed",
      };
    case "pending":
      return {
        color: "bg-gray-400",
        text: "text-gray-500 dark:text-gray-400",
        bg: "bg-gray-50 dark:bg-gray-900/30",
        border: "border-gray-200 dark:border-gray-700",
        icon: ClockIcon,
        label: "Pending",
      };
    case "skipped":
      return {
        color: "bg-amber-400",
        text: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/30",
        border: "border-amber-200 dark:border-amber-800",
        icon: ClockIcon,
        label: "Skipped",
      };
    default:
      return {
        color: "bg-gray-400",
        text: "text-gray-500",
        bg: "bg-gray-50",
        border: "border-gray-200",
        icon: ClockIcon,
        label: "Unknown",
      };
  }
}

function formatJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2);
}

function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

// ─── Collapsible JSON Viewer ─────────────────────────────────────────────────

function JsonViewer({
  data,
  label,
  defaultExpanded = true,
}: {
  data: Record<string, unknown>;
  label?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(formatJson(data));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div
        className="flex items-center justify-between px-2.5 py-1.5 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5">
          {expanded ? (
            <ChevronDownIcon className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="text-xs font-medium text-muted-foreground">
            {label || "Data"}
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            {Object.keys(data).length} keys
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
        >
          <CopyIcon className={cn("h-3 w-3", copied ? "text-green-500" : "text-muted-foreground")} />
        </Button>
      </div>
      {expanded && (
        <ScrollArea className="max-h-60">
          <pre className="p-2.5 font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {formatJson(data)}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function StateInspector({
  nodeState,
  nodeLabel,
  nodeType,
  isOpen,
  onClose,
  allNodeStates,
  edges,
  nodeDefinitions,
}: StateInspectorProps) {
  const [showUpstream, setShowUpstream] = useState(true);
  const [showDownstream, setShowDownstream] = useState(false);

  if (!isOpen || !nodeState) return null;

  const statusConfig = getStatusConfig(nodeState.status);
  const StatusIcon = statusConfig.icon;

  // Find upstream/downstream nodes
  const upstreamNodes =
    edges
      ?.filter((e) => e.to === nodeState.node_id)
      .map((e) => ({
        edgeId: e.id,
        edgeType: e.type,
        nodeId: e.from_node,
        state: allNodeStates?.[e.from_node] ?? null,
        label: nodeDefinitions?.[e.from_node]?.label ?? e.from_node,
      })) ?? [];

  const downstreamNodes =
    edges
      ?.filter((e) => e.from_node === nodeState.node_id)
      .map((e) => ({
        edgeId: e.id,
        edgeType: e.type,
        nodeId: e.to,
        state: allNodeStates?.[e.to] ?? null,
        label: nodeDefinitions?.[e.to]?.label ?? e.to,
      })) ?? [];

  return (
    <div
      className={cn(
        "flex flex-col h-full border-l border-border bg-background overflow-hidden",
        "w-96 min-w-80"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-full flex-shrink-0",
              statusConfig.color
            )}
          />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">
              {nodeLabel || nodeState.node_id}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">{nodeState.node_id}</span>
              {nodeType && (
                <>
                  <span>·</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {nodeType}
                  </Badge>
                </>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 flex-shrink-0"
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Status Banner */}
          <div
            className={cn(
              "rounded-lg border p-3",
              statusConfig.bg,
              statusConfig.border
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusIcon className={cn("h-4 w-4", statusConfig.text)} />
                <span className={cn("text-sm font-medium", statusConfig.text)}>
                  {statusConfig.label}
                </span>
              </div>
              {nodeState.is_mock && (
                <Badge variant="secondary" className="text-[10px] h-4">
                  MOCK
                </Badge>
              )}
            </div>
            {nodeState.error_message && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                {nodeState.error_message}
              </p>
            )}
          </div>

          {/* Timing & Cost */}
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <ClockIcon className="h-3 w-3" />
                <span className="text-[10px] uppercase tracking-wider font-medium">
                  Duration
                </span>
              </div>
              <div className="text-lg font-bold tabular-nums">
                {nodeState.duration_ms > 0
                  ? formatDuration(nodeState.duration_ms)
                  : "—"}
              </div>
            </Card>

            <Card className="p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <DollarSignIcon className="h-3 w-3" />
                <span className="text-[10px] uppercase tracking-wider font-medium">
                  Est. Cost
                </span>
              </div>
              <div className="text-lg font-bold tabular-nums">
                {formatCost(nodeState.estimated_cost_usd)}
              </div>
            </Card>

            {nodeState.estimated_tokens > 0 && (
              <Card className="p-3 col-span-2">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <ZapIcon className="h-3 w-3" />
                  <span className="text-[10px] uppercase tracking-wider font-medium">
                    Estimated Tokens
                  </span>
                </div>
                <div className="text-lg font-bold tabular-nums">
                  {nodeState.estimated_tokens.toLocaleString()}
                </div>
              </Card>
            )}
          </div>

          {/* Timestamps */}
          {(nodeState.started_at || nodeState.completed_at) && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {nodeState.started_at && (
                <div className="flex justify-between">
                  <span>Started</span>
                  <span className="font-mono">
                    {new Date(nodeState.started_at).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {nodeState.completed_at && (
                <div className="flex justify-between">
                  <span>Completed</span>
                  <span className="font-mono">
                    {new Date(nodeState.completed_at).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Input Data */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Input Data
            </h4>
            {Object.keys(nodeState.input_data).length > 0 ? (
              <JsonViewer data={nodeState.input_data} label="Input" />
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No input data
              </p>
            )}
          </div>

          {/* Output Data */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Output Data
            </h4>
            {Object.keys(nodeState.output_data).length > 0 ? (
              <JsonViewer data={nodeState.output_data} label="Output" />
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No output data
              </p>
            )}
          </div>

          <Separator />

          {/* Upstream Connections */}
          {upstreamNodes.length > 0 && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                onClick={() => setShowUpstream(!showUpstream)}
              >
                {showUpstream ? (
                  <ChevronDownIcon className="h-3 w-3" />
                ) : (
                  <ChevronRightIcon className="h-3 w-3" />
                )}
                Upstream ({upstreamNodes.length})
              </button>
              {showUpstream && (
                <div className="space-y-1">
                  {upstreamNodes.map((node) => {
                    const nodeStatus = node.state
                      ? getStatusConfig(node.state.status)
                      : null;
                    return (
                      <div
                        key={node.edgeId}
                        className="flex items-center gap-2 p-1.5 rounded bg-muted/30 text-xs"
                      >
                        <ArrowRightIcon className="h-3 w-3 text-muted-foreground rotate-180" />
                        {nodeStatus && (
                          <div
                            className={cn("w-1.5 h-1.5 rounded-full", nodeStatus.color)}
                          />
                        )}
                        <span className="truncate">{node.label}</span>
                        <Badge variant="outline" className="text-[9px] h-3 px-1 ml-auto">
                          {node.edgeType}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Downstream Connections */}
          {downstreamNodes.length > 0 && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                onClick={() => setShowDownstream(!showDownstream)}
              >
                {showDownstream ? (
                  <ChevronDownIcon className="h-3 w-3" />
                ) : (
                  <ChevronRightIcon className="h-3 w-3" />
                )}
                Downstream ({downstreamNodes.length})
              </button>
              {showDownstream && (
                <div className="space-y-1">
                  {downstreamNodes.map((node) => {
                    const nodeStatus = node.state
                      ? getStatusConfig(node.state.status)
                      : null;
                    return (
                      <div
                        key={node.edgeId}
                        className="flex items-center gap-2 p-1.5 rounded bg-muted/30 text-xs"
                      >
                        <ArrowRightIcon className="h-3 w-3 text-muted-foreground" />
                        {nodeStatus && (
                          <div
                            className={cn("w-1.5 h-1.5 rounded-full", nodeStatus.color)}
                          />
                        )}
                        <span className="truncate">{node.label}</span>
                        <Badge variant="outline" className="text-[9px] h-3 px-1 ml-auto">
                          {node.edgeType}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
