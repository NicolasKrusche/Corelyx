"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import type { NodeValidationState, ValidationError, ValidationWarning } from "@/lib/validation";
import type { NodeStatus, AgentConfig } from "@flowos/schema";

interface AgentNodeData {
  label: string;
  description: string;
  connection: string | null;
  status: NodeStatus;
  config: AgentConfig;
  validationState: NodeValidationState;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export function AgentNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData;
  const config = nodeData.config as AgentConfig | undefined;
  const isUnassigned = config?.model === "__USER_ASSIGNED__";
  const requiresApproval = config?.requires_approval === true;

  return (
    <>
      {/* Target handle — top */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-purple-500 !border-2 !border-card !w-3.5 !h-3.5 !shadow-[0_0_6px_rgba(168,85,247,0.6)]"
      />

      <NodeShell
        selected={selected ?? false}
        validationState={nodeData.validationState ?? "valid"}
        status={nodeData.status}
        accentColor="bg-purple-500"
        accentRing="ring-purple-500/50 shadow-purple-500/20"
      >
        {/* Type badge */}
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <span className="inline-flex items-center rounded-sm bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-400 uppercase tracking-wide">
            Agent
          </span>
          {isUnassigned && (
            <span className="inline-flex items-center rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              No model
            </span>
          )}
          {requiresApproval && (
            <span className="inline-flex items-center rounded-sm bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
              Approval
            </span>
          )}
        </div>

        {/* Label */}
        <p className="text-sm font-semibold text-foreground leading-tight truncate pr-4">
          {nodeData.label || "Untitled Agent"}
        </p>

        {/* Description */}
        {nodeData.description && (
          <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
            {nodeData.description}
          </p>
        )}

        {/* Connection name */}
        {nodeData.connection && (
          <p className="text-[10px] text-muted-foreground truncate">
            via {nodeData.connection}
          </p>
        )}

        {/* Validation errors */}
        {nodeData.errors?.length > 0 && (
          <div className="mt-1 text-[10px] text-red-600 dark:text-red-400 font-medium">
            {nodeData.errors[0].message}
          </div>
        )}
        {nodeData.warnings?.length > 0 && nodeData.errors?.length === 0 && (
          <div className="mt-1 text-[10px] text-yellow-600 dark:text-yellow-400 font-medium">
            {nodeData.warnings[0].message}
          </div>
        )}
      </NodeShell>

      {/* Source handle — bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-purple-500 !border-2 !border-card !w-3.5 !h-3.5 !shadow-[0_0_6px_rgba(168,85,247,0.6)]"
      />
    </>
  );
}
