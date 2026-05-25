"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import type { NodeValidationState, ValidationError, ValidationWarning } from "@/lib/validation";
import type { NodeStatus, StepConfig } from "@flowos/schema";

interface StepNodeData {
  label: string;
  description: string;
  connection: null;
  status: NodeStatus;
  config: StepConfig;
  validationState: NodeValidationState;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const LOGIC_TYPE_LABEL: Record<StepConfig["logic_type"], string> = {
  transform: "Transform",
  filter: "Filter",
  branch: "Branch",
  delay: "Delay",
  loop: "Loop",
  format: "Format",
  parse: "Parse",
  deduplicate: "Deduplicate",
  sort: "Sort",
};

export function StepNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as StepNodeData;
  const logicType = nodeData.config?.logic_type as StepConfig["logic_type"] | undefined;

  return (
    <>
      {/* Target handle — top */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-sky-500 !border-2 !border-card !w-3.5 !h-3.5 !shadow-[0_0_6px_rgba(14,165,233,0.6)]"
      />

      <NodeShell
        selected={selected ?? false}
        validationState={nodeData.validationState ?? "valid"}
        status={nodeData.status}
        accentColor="bg-sky-500"
        accentRing="ring-sky-500/50 shadow-sky-500/20"
      >
        {/* Type badge */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="inline-flex items-center rounded-sm bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-400 uppercase tracking-wide">
            Step
          </span>
          {logicType && (
            <span className="inline-flex items-center rounded-sm bg-black/[0.05] dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
              {LOGIC_TYPE_LABEL[logicType]}
            </span>
          )}
        </div>

        {/* Label */}
        <p className="text-sm font-semibold text-foreground leading-tight truncate pr-4">
          {nodeData.label || "Untitled Step"}
        </p>

        {/* Description */}
        {nodeData.description && (
          <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
            {nodeData.description}
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
        className="!bg-sky-500 !border-2 !border-card !w-3.5 !h-3.5 !shadow-[0_0_6px_rgba(14,165,233,0.6)]"
      />
    </>
  );
}
