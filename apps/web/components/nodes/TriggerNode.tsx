"use client";

import React from "react";
import { Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Clock, MousePointerClick, Webhook, Workflow, Zap, type LucideIcon } from "lucide-react";
import { NodeShell, NodeHandle, NodeAddButton } from "./NodeShell";
import type { NodeValidationState, ValidationError, ValidationWarning } from "@/lib/validation";
import type { NodeStatus, TriggerConfig } from "@flowos/schema";

interface TriggerNodeData {
  label: string;
  description: string;
  connection: string | null;
  status: NodeStatus;
  config: TriggerConfig;
  validationState: NodeValidationState;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const TRIGGER_TYPE_LABEL: Record<TriggerConfig["trigger_type"], string> = {
  cron: "Schedule",
  event: "Event",
  webhook: "Webhook",
  manual: "Manual",
  program_output: "Program Output",
};

const TRIGGER_TYPE_ICON: Record<TriggerConfig["trigger_type"], LucideIcon> = {
  cron: Clock,
  event: Zap,
  webhook: Webhook,
  manual: MousePointerClick,
  program_output: Workflow,
};

export function TriggerNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;
  const triggerType = nodeData.config?.trigger_type as TriggerConfig["trigger_type"] | undefined;

  return (
    <>
      <NodeShell
        selected={selected ?? false}
        validationState={nodeData.validationState ?? "valid"}
        status={nodeData.status}
        accent="green"
        icon={triggerType ? TRIGGER_TYPE_ICON[triggerType] : Zap}
        kicker={triggerType ? `Trigger · ${TRIGGER_TYPE_LABEL[triggerType]}` : "Trigger"}
        title={nodeData.label || "Untitled Trigger"}
        subtitle={nodeData.description}
        error={nodeData.errors?.[0]?.message}
        warning={nodeData.warnings?.[0]?.message}
      />

      {/* Source handle only — triggers have no incoming connections */}
      <NodeHandle type="source" position={Position.Bottom} accent="green" />
      <NodeAddButton nodeId={id} />
    </>
  );
}
