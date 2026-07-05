"use client";

import React from "react";
import { Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Globe, Plug, FolderOpen } from "lucide-react";
import { NodeShell, NodeHandle, SourceAddHandle } from "./NodeShell";
import type { NodeValidationState, ValidationError, ValidationWarning } from "@/lib/validation";
import type {
  NodeStatus,
  ConnectionConfig,
  HttpConnectionConfig,
  OAuthConnectionConfig,
  FileConnectionConfig,
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

function isFileConnectionConfig(config: ConnectionConfig): config is FileConnectionConfig {
  return config.connector_type === "file";
}

function isOAuthConnectionConfig(config: ConnectionConfig): config is OAuthConnectionConfig {
  return config.connector_type !== "http" && config.connector_type !== "file";
}

export function ConnectionNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ConnectionNodeData;
  const httpConfig = isHttpConnectionConfig(nodeData.config) ? nodeData.config : null;
  const fileConfig = isFileConnectionConfig(nodeData.config) ? nodeData.config : null;
  const oauthConfig = isOAuthConnectionConfig(nodeData.config) ? nodeData.config : null;

  const kicker = httpConfig
    ? `HTTP · ${httpConfig.method}`
    : fileConfig
    ? `Files · ${fileConfig.operation}`
    : `Connection · ${
        oauthConfig ? (SCOPE_LABEL[oauthConfig.scope_access] ?? oauthConfig.scope_access) : "Read"
      }`;

  const meta = httpConfig?.url
    || (fileConfig ? (String((fileConfig.operation_params ?? {}).path ?? "") || undefined) : undefined)
    || nodeData.connection
    || undefined;

  return (
    <>
      <NodeHandle type="target" position={Position.Top} accent="blue" />

      <NodeShell
        selected={selected ?? false}
        validationState={nodeData.validationState ?? "valid"}
        status={nodeData.status}
        accent="blue"
        icon={httpConfig ? Globe : fileConfig ? FolderOpen : Plug}
        logo={oauthConfig ? { provider: oauthConfig.provider, label: nodeData.label || "Connection" } : undefined}
        kicker={kicker}
        title={nodeData.label || "Untitled Connection"}
        subtitle={nodeData.description}
        meta={meta}
        error={nodeData.errors?.[0]?.message}
        warning={nodeData.warnings?.[0]?.message}
        questionPin={(data as { genesisQuestion?: string | null }).genesisQuestion}
      />

      <SourceAddHandle nodeId={id} accent="blue" />
    </>
  );
}
