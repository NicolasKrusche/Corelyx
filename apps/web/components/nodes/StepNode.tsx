"use client";

import React from "react";
import { Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import {
  ArrowUpDown,
  Braces,
  Filter,
  GitBranch,
  Layers,
  Repeat,
  Shuffle,
  Timer,
  Type,
  type LucideIcon,
} from "lucide-react";
import { NodeShell, NodeHandle, SourceAddHandle } from "./NodeShell";
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

const LOGIC_TYPE_ICON: Record<StepConfig["logic_type"], LucideIcon> = {
  transform: Shuffle,
  filter: Filter,
  branch: GitBranch,
  delay: Timer,
  loop: Repeat,
  format: Type,
  parse: Braces,
  deduplicate: Layers,
  sort: ArrowUpDown,
};

export function StepNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as StepNodeData;
  const logicType = nodeData.config?.logic_type as StepConfig["logic_type"] | undefined;

  return (
    <>
      <NodeHandle type="target" position={Position.Top} accent="sky" />

      <NodeShell
        selected={selected ?? false}
        validationState={nodeData.validationState ?? "valid"}
        status={nodeData.status}
        accent="sky"
        icon={logicType ? LOGIC_TYPE_ICON[logicType] : Shuffle}
        kicker={logicType ? `Step · ${LOGIC_TYPE_LABEL[logicType]}` : "Step"}
        title={nodeData.label || "Untitled Step"}
        subtitle={nodeData.description}
        error={nodeData.errors?.[0]?.message}
        warning={nodeData.warnings?.[0]?.message}
      />

      <SourceAddHandle nodeId={id} accent="sky" />
    </>
  );
}
