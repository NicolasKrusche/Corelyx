"use client";

import React from "react";
import type { NodeProps } from "@xyflow/react";
import { Clock, MousePointerClick, Webhook, Workflow, Zap, FolderSearch, type LucideIcon } from "lucide-react";
import { NodeShell, SourceAddHandle, InlineSelect } from "./NodeShell";
import type { NodeValidationState, ValidationError, ValidationWarning } from "@/lib/validation";
import type { NodeStatus, TriggerConfig } from "@flowos/schema";
import { previewNodeOutput } from "@/lib/genesis/node-preview";
import { useOptionalEditorDispatch } from "@/lib/editor/state";

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
  file_watch: "File Watch",
};

const TRIGGER_TYPE_ICON: Record<TriggerConfig["trigger_type"], LucideIcon> = {
  cron: Clock,
  event: Zap,
  webhook: Webhook,
  manual: MousePointerClick,
  program_output: Workflow,
  file_watch: FolderSearch,
};

// Common schedules for the inline quick-edit. Value is the cron expression.
const CRON_PRESETS: { value: string; label: string }[] = [
  { value: "*/15 * * * *", label: "Every 15 min" },
  { value: "0 * * * *", label: "Hourly" },
  { value: "0 8 * * *", label: "Daily 8am" },
  { value: "0 9 * * 1-5", label: "Weekdays 9am" },
  { value: "0 9 * * 1", label: "Mon 9am" },
  { value: "0 0 1 * *", label: "Monthly 1st" },
];

export function TriggerNode({ id, data, selected }: NodeProps) {
  const dispatch = useOptionalEditorDispatch();
  const nodeData = data as unknown as TriggerNodeData;
  const config = nodeData.config;
  const triggerType = config?.trigger_type as TriggerConfig["trigger_type"] | undefined;

  // Inline schedule edit for cron triggers when the node is selected. Presets
  // cover the common cases; a bespoke expression stays selectable as "Custom".
  let footer: React.ReactNode = null;
  if (selected && dispatch && config?.trigger_type === "cron") {
    const current = config.expression;
    const options = CRON_PRESETS.some((p) => p.value === current)
      ? CRON_PRESETS
      : [{ value: current, label: `Custom · ${current || "unset"}` }, ...CRON_PRESETS];
    footer = (
      <InlineSelect
        label="Schedule"
        value={current}
        options={options}
        onChange={(expression) =>
          dispatch({
            type: "UPDATE_NODE_CONFIG",
            nodeId: id,
            config: { ...config, expression },
          })
        }
      />
    );
  }

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
        questionPin={(data as { genesisQuestion?: string | null }).genesisQuestion}
        outputPreview={config ? previewNodeOutput({ type: "trigger", config }) : null}
        footer={footer}
      />

      {/* Source handle only — triggers have no incoming connections */}
      <SourceAddHandle nodeId={id} accent="green" />
    </>
  );
}
