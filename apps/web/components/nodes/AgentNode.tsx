"use client";

import React from "react";
import { Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";
import { NodeShell, NodeHandle, type NodeBadge } from "./NodeShell";
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

  const badges: NodeBadge[] = [];
  if (isUnassigned) badges.push({ label: "No model", tone: "amber" });
  if (requiresApproval) badges.push({ label: "Approval", tone: "blue" });

  return (
    <>
      <NodeHandle type="target" position={Position.Top} accent="purple" />

      <NodeShell
        selected={selected ?? false}
        validationState={nodeData.validationState ?? "valid"}
        status={nodeData.status}
        accent="purple"
        icon={Bot}
        kicker="Agent"
        title={nodeData.label || "Untitled Agent"}
        subtitle={nodeData.description}
        meta={nodeData.connection ? `via ${nodeData.connection}` : undefined}
        badges={badges}
        error={nodeData.errors?.[0]?.message}
        warning={nodeData.warnings?.[0]?.message}
      />

      <NodeHandle type="source" position={Position.Bottom} accent="purple" />
    </>
  );
}
