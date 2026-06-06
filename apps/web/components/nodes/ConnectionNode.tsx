"use client";

import React from "react";
import { Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Globe, Plug } from "lucide-react";
import { NodeShell, NodeHandle } from "./NodeShell";
import type { NodeValidationState, ValidationError, ValidationWarning } from "@/lib/validation";
import type {
  NodeStatus,
  ConnectionConfig,
  HttpConnectionConfig,
  OAuthConnectionConfig,
} from "@flowos/schema";

interface ConnectionNodeData {
  label: string;
  description: string;
  connection: string | null;
  status: NodeStatus;
  config: ConnectionConfig;
  validationState: NodeValidationState;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const SCOPE_LABEL: Record<string, string> = {
  read: "Read",
  write: "Write",
  read_write: "Read + Write",
};

function isHttpConnectionConfig(config: ConnectionConfig): config is HttpConnectionConfig {
  return config.connector_type === "http";
}

function isOAuthConnectionConfig(config: ConnectionConfig): config is OAuthConnectionConfig {
  return config.connector_type !== "http";
}

export function ConnectionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConnectionNodeData;
  const httpConfig = isHttpConnectionConfig(nodeData.config) ? nodeData.config : null;
  const oauthConfig = isOAuthConnectionConfig(nodeData.config) ? nodeData.config : null;

  const kicker = httpConfig
    ? `HTTP · ${httpConfig.method}`
    : `Connection · ${
        oauthConfig ? (SCOPE_LABEL[oauthConfig.scope_access] ?? oauthConfig.scope_access) : "Read"
      }`;

  const meta = httpConfig?.url || nodeData.connection || undefined;

  return (
    <>
      <NodeHandle type="target" position={Position.Top} accent="blue" />

      <NodeShell
        selected={selected ?? false}
        validationState={nodeData.validationState ?? "valid"}
        status={nodeData.status}
        accent="blue"
        icon={httpConfig ? Globe : Plug}
        kicker={kicker}
        title={nodeData.label || "Untitled Connection"}
        subtitle={nodeData.description}
        meta={meta}
        error={nodeData.errors?.[0]?.message}
        warning={nodeData.warnings?.[0]?.message}
      />

      <NodeHandle type="source" position={Position.Bottom} accent="blue" />
    </>
  );
}
