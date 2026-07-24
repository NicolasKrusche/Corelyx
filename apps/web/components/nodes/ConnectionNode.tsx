"use client";

import React from "react";
import { Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Globe, Plug, FolderOpen } from "lucide-react";
import { NodeShell, NodeHandle, SourceAddHandle, InlineSelect } from "./NodeShell";
import type { NodeValidationState, ValidationError, ValidationWarning } from "@/lib/validation";
import type {
  NodeStatus,
  ConnectionConfig,
  HttpConnectionConfig,
  OAuthConnectionConfig,
  FileConnectionConfig,
} from "@flowos/schema";
import { previewNodeOutput } from "@/lib/genesis/node-preview";
import { CONNECTOR_OPERATIONS, OPERATION_SCOPES } from "@/lib/connectors/catalog";
import { useOptionalEditorDispatch } from "@/lib/editor/state";

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

function ConnectionNodeImpl({ id, data, selected }: NodeProps) {
  const dispatch = useOptionalEditorDispatch();
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

  // Inline operation edit for OAuth connectors when selected — swap what the
  // node does without opening the sidebar. Mirrors the sidebar's behaviour:
  // resetting params and pulling the operation's default scopes.
  let footer: React.ReactNode = null;
  const provider = oauthConfig?.provider ?? "";
  const supportedOps = provider ? (CONNECTOR_OPERATIONS[provider] ?? []) : [];
  if (selected && dispatch && oauthConfig && supportedOps.length > 0) {
    footer = (
      <InlineSelect
        label="Operation"
        value={oauthConfig.operation ?? ""}
        options={[
          { value: "", label: "— pass token downstream —" },
          ...supportedOps.map((op) => ({ value: op, label: op })),
        ]}
        onChange={(op) => {
          const nextOp = op || undefined;
          const autoScopes = nextOp ? (OPERATION_SCOPES[provider]?.[nextOp] ?? []) : [];
          dispatch({
            type: "UPDATE_NODE_CONFIG",
            nodeId: id,
            config: {
              ...oauthConfig,
              operation: nextOp,
              operation_params: undefined,
              ...(autoScopes.length > 0 ? { scope_required: autoScopes } : {}),
            },
          });
        }}
      />
    );
  }

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
        outputPreview={nodeData.config ? previewNodeOutput({ type: "connection", config: nodeData.config, connection: nodeData.connection }) : null}
        footer={footer}
      />

      <SourceAddHandle nodeId={id} accent="blue" />
    </>
  );
}

// React Flow re-renders every custom node on any store change (drag, selection,
// viewport). memo() with the default shallow prop compare limits re-renders to
// when this node's own props (id/data/selected/…) actually change.
export const ConnectionNode = React.memo(ConnectionNodeImpl);
ConnectionNode.displayName = "ConnectionNode";
