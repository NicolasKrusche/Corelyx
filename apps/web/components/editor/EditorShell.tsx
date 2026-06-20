"use client";

import React, { useReducer, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Node as ReactFlowNode,
  type Edge as ReactFlowEdge,
  type ReactFlowInstance,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { editorReducer, initialEditorState, EditorDispatchContext } from "@/lib/editor/state";
import { writeClipboard, readClipboard, buildPastePayload } from "@/lib/editor/clipboard";
import { DebugPanel } from "@/components/editor/DebugPanel";
import { toReactFlow } from "@/lib/schema";
import {
  applyDagreLayout,
  needsLayout,
  layoutSchema,
  DEFAULT_LAYOUT_DIRECTION,
  type LayoutDirection,
} from "@/lib/schema/layout";
import { validatePostGenesis } from "@/lib/validation";

import { TriggerNode } from "@/components/nodes/TriggerNode";
import { AgentNode } from "@/components/nodes/AgentNode";
import { StepNode } from "@/components/nodes/StepNode";
import { ConnectionNode } from "@/components/nodes/ConnectionNode";
import { NoteNode } from "@/components/nodes/NoteNode";
import { GroupNode } from "@/components/nodes/GroupNode";
import { DataFlowEdge } from "@/components/edges/DataFlowEdge";
import { ControlFlowEdge } from "@/components/edges/ControlFlowEdge";
import { EventEdge } from "@/components/edges/EventEdge";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { VersionHistoryPanel } from "@/components/editor/VersionHistoryPanel";
import { RunLogDrawer } from "@/components/editor/RunLogDrawer";
import { NodeSidebar } from "@/components/sidebars/NodeSidebar";
import type { ApiKey } from "@/components/sidebars/NodeSidebar";
import { NodePalettePanel } from "@/components/editor/NodePalettePanel";
import type { NodeVariant, TriggerSubtype, StepSubtype, NoteColor } from "@/components/editor/NodePalettePanel";
import { AiEditPanel } from "@/components/editor/AiEditPanel";
import { EditorTour } from "@/components/editor/editor-tour";
import type { AiEditMode } from "@/components/editor/AiEditPanel";
import { RawSchemaPanel } from "@/components/editor/RawSchemaPanel";
import { NodeCanvasContext } from "@/components/nodes/node-canvas-context";
import { useRawSchemaMode } from "@/lib/raw-schema-mode";

import type { ProgramSchema, Node as SchemaNode, TriggerConfig, StepConfig } from "@flowos/schema";
import type { ValidationResult } from "@/lib/validation";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { friendlyErrorMessage, friendlyResponseMessage } from "@/lib/friendly-errors";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PreFlightCheck } from "@/lib/validation/pre-flight";
import type { ComplianceCheck } from "@/lib/compliance/workflow";
import { useTheme } from "@/components/theme-provider";
import {
  isJsonObject,
  workflowRequiresPayloadForManualRun,
} from "@/lib/triggers/manual-run";

// ─── Node execution data (populated from API + Realtime) ─────────────────────

export interface NodeExecutionData {
  status: SchemaNode["status"];
  input_payload: unknown;
  output_payload: unknown;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  retry_count: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  connector_api_calls: number;
  model_call_count: number;
  created_at: string;
}

// ─── Custom node/edge type registrations ─────────────────────────────────────

const nodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  step: StepNode,
  connection: ConnectionNode,
  note: NoteNode,
  group: GroupNode,
} as const;

const edgeTypes = {
  data_flow: DataFlowEdge,
  control_flow: ControlFlowEdge,
  event_subscription: EventEdge,
} as const;

// ─── Default node configs for new nodes ──────────────────────────────────────

const OAUTH_PROVIDER_LABELS: Record<string, string> = {
  gmail: "Gmail", notion: "Notion", slack: "Slack", github: "GitHub",
  sheets: "Google Sheets", calendar: "Google Calendar", docs: "Google Docs",
  drive: "Google Drive", airtable: "Airtable", hubspot: "HubSpot",
  typeform: "Typeform", asana: "Asana", outlook: "Outlook",
  shopify: "Shopify", zoom: "Zoom", sentry: "Sentry", gitlab: "GitLab",
  confluence: "Confluence", jira: "Jira", dropbox: "Dropbox",
  todoist: "Todoist", calendly: "Calendly",
};

function makeDefaultNode(variant: NodeVariant, id: string, position: { x: number; y: number }): SchemaNode {
  if (variant.type === "trigger") {
    const labels: Record<string, string> = {
      manual: "Manual Trigger", cron: "Cron Schedule",
      webhook: "Webhook Trigger", event: "Event Trigger",
      program_output: "Program Output Trigger", file_watch: "File Watch Trigger",
    };
    const configs: Record<TriggerSubtype, TriggerConfig> = {
      manual:         { trigger_type: "manual" },
      cron:           { trigger_type: "cron", expression: "0 9 * * 1-5", timezone: "UTC" },
      webhook:        { trigger_type: "webhook", endpoint_id: crypto.randomUUID(), method: "POST" },
      event:          { trigger_type: "event", source: "", event: "", filter: null },
      program_output: { trigger_type: "program_output", source_program_id: "__USER_ASSIGNED__", on_status: ["success"] },
      file_watch:     { trigger_type: "file_watch", device_id: null, path: "", events: ["created"], patterns: [] },
    };
    return {
      id, type: "trigger", status: "idle", connection: null,
      label: labels[variant.subtype] ?? "Trigger",
      description: "",
      position,
      config: configs[variant.subtype],
    };
  }

  if (variant.type === "agent") {
    return {
      id, type: "agent", label: "AI Agent", description: "", connection: null,
      position, status: "idle",
      config: {
        model: "__USER_ASSIGNED__",
        api_key_ref: "__USER_ASSIGNED__",
        system_prompt: "",
        input_schema: null,
        output_schema: null,
        requires_approval: false,
        approval_timeout_hours: 24,
        scope_required: null,
        scope_access: "read",
        retry: { max_attempts: 3, backoff: "exponential", backoff_base_seconds: 5, fail_program_on_exhaust: false },
        tools: [],
      },
    };
  }

  if (variant.type === "step") {
    const labels: Record<string, string> = {
      transform: "Transform", filter: "Filter", branch: "Branch",
      delay: "Delay", loop: "Loop", format: "Format",
      parse: "Parse", deduplicate: "Deduplicate", sort: "Sort",
    };
    const configs: Record<StepSubtype, StepConfig> = {
      transform:   { logic_type: "transform", transformation: "", input_schema: null, output_schema: null },
      filter:      { logic_type: "filter", condition: "", pass_schema: null },
      branch:      { logic_type: "branch", conditions: [], default_branch: "" },
      delay:       { logic_type: "delay", seconds: 5 },
      loop:        { logic_type: "loop", over: "input.items", item_var: "item" },
      format:      { logic_type: "format", template: "", output_key: "text" },
      parse:       { logic_type: "parse", input_key: "text", format: "json" },
      deduplicate: { logic_type: "deduplicate", key: "id" },
      sort:        { logic_type: "sort", key: "id", order: "asc" },
    };
    return {
      id, type: "step", status: "idle", connection: null,
      label: labels[variant.subtype] ?? "Step",
      description: "",
      position,
      config: configs[variant.subtype],
    };
  }

  if (variant.type === "note") {
    return {
      id, type: "note", label: "Note", description: "", connection: null,
      position, status: "idle",
      config: { content: "", color: (variant as { type: "note"; color: NoteColor }).color, width: 200, height: 120 },
    };
  }

  if (variant.type === "group") {
    return {
      id, type: "group", label: "Group", description: "", connection: null,
      position, status: "idle",
      config: { childIds: [], width: 400, height: 300, color: "zinc" },
    };
  }

  // connection
  if (variant.subtype === "http") {
    return {
      id, type: "connection", label: "HTTP Request", description: "", connection: null,
      position, status: "idle",
      config: {
        connector_type: "http",
        method: "GET",
        url: "",
        auth_type: "none",
        auth_value: null,
        query_params: [],
        headers: [],
        body: null,
        parse_response: true,
        timeout_seconds: null,
        retry: null,
      },
    };
  }
  // Local files (desktop Bridge) connection
  if (variant.subtype === "file") {
    return {
      id, type: "connection", label: "Local Files", description: "", connection: null,
      position, status: "idle",
      config: {
        connector_type: "file",
        device_id: null,
        operation: "read",
        operation_params: {},
        scope_access: "read",
      },
    };
  }
  // OAuth connection
  return {
    id, type: "connection",
    label: OAUTH_PROVIDER_LABELS[variant.subtype] ?? variant.subtype,
    description: "",
    connection: null, // user picks in sidebar
    position, status: "idle",
    config: {
      provider: variant.subtype,
      scope_access: "read",
      scope_required: [],
    },
  };
}

const TRIGGER_SUBTYPES = ["manual", "cron", "webhook", "event", "program_output", "file_watch"] as const;
const STEP_SUBTYPES = ["transform", "filter", "branch", "delay", "loop", "format", "parse", "deduplicate", "sort"] as const;
const CONNECTION_SUBTYPES = [
  "http", "file", "gmail", "notion", "slack", "github", "sheets",
  "calendar", "docs", "drive", "airtable", "hubspot",
  "typeform", "asana", "outlook",
  "shopify", "zoom", "sentry", "gitlab", "confluence",
  "jira", "dropbox", "todoist", "calendly",
] as const;

function includesString(values: readonly string[], value: unknown): value is string {
  return typeof value === "string" && values.includes(value);
}

const NOTE_COLORS = ["yellow", "blue", "pink", "green"] as const;

function isNodeVariant(value: unknown): value is NodeVariant {
  if (!value || typeof value !== "object") return false;

  const variant = value as { type?: unknown; subtype?: unknown; color?: unknown };
  if (variant.type === "agent") return true;
  if (variant.type === "group") return true;
  if (variant.type === "trigger") return includesString(TRIGGER_SUBTYPES, variant.subtype);
  if (variant.type === "step") return includesString(STEP_SUBTYPES, variant.subtype);
  if (variant.type === "connection") return includesString(CONNECTION_SUBTYPES, variant.subtype);
  if (variant.type === "note") return includesString(NOTE_COLORS, variant.color);
  return false;
}

function schemaNodeToReactFlowNode(schemaNode: SchemaNode): ReactFlowNode {
  const cfg = schemaNode.config as Record<string, unknown>;
  const style =
    schemaNode.type === "group"
      ? { width: (cfg.width as number) ?? 400, height: (cfg.height as number) ?? 300 }
      : schemaNode.type === "note"
        ? { width: (cfg.width as number) ?? 200, height: (cfg.height as number) ?? 120 }
        : undefined;

  // Groups must sit below every other node so clicks reach the nodes inside them.
  // Notes float above everything. Regular nodes are at 1 — above groups, below notes.
  const zIndex =
    schemaNode.type === "group" ? 0
    : schemaNode.type === "note" ? 1000
    : 1;

  return {
    id: schemaNode.id,
    type: schemaNode.type,
    draggable: true,
    selectable: true,
    zIndex,
    position: schemaNode.position,
    ...(style ? { style } : {}),
    ...(schemaNode.type === "note" ? { dragHandle: ".note-drag-handle" } : {}),
    data: {
      label: schemaNode.label,
      description: schemaNode.description,
      connection: schemaNode.connection,
      status: schemaNode.status,
      config: schemaNode.config,
      validationState: "valid",
      errors: [],
      warnings: [],
    },
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

// ─── Browser notification helpers ────────────────────────────────────────────

/** Ask for permission once — called just before the AI edit starts. */
function requestNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

/**
 * Fire a desktop notification only when the user has navigated away from the
 * tab. Does nothing if the tab is already focused or permission was denied.
 */
function notifyIfHidden(title: string, body: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {
    // Safari may throw even with permission granted; silently ignore
  }
}

function makePreFlightErrorCheck(
  label: string,
  message: string,
  fixSuggestion: string
): PreFlightCheck {
  return {
    code: "PRE_001",
    label,
    status: "fail",
    failures: [{ node_id: null, message, fix_suggestion: fixSuggestion }],
  };
}

interface EditorShellProps {
  programId: string;
  initialSchema: ProgramSchema;
  initialValidation: ValidationResult | null;
  apiKeys: ApiKey[];
  linkedConnections: { id: string; name: string; provider: string; scopes: string[] }[];
  allConnections: { id: string; name: string; provider: string; scopes: string[] }[];
  enableAdvancedEditor?: boolean;
}

type EditorContextMenu =
  | { kind: "node"; nodeId: string; x: number; y: number }
  | { kind: "edge"; edgeId: string; x: number; y: number }
  | { kind: "pane"; x: number; y: number; flowPosition: { x: number; y: number } }
  | null;

// ─── EditorShell ──────────────────────────────────────────────────────────────

export function EditorShell({
  programId,
  initialSchema,
  initialValidation,
  apiKeys,
  linkedConnections: initialLinkedConnections,
  allConnections,
  enableAdvancedEditor = false,
}: EditorShellProps) {
  const router = useRouter();
  const { base } = useTheme();
  const isDarkTheme = base === "dark";
  const minimapNodeColors = React.useMemo<Record<string, string>>(
    () => isDarkTheme
      ? {
          trigger: "#34d399",
          agent: "#c084fc",
          step: "#60a5fa",
          connection: "#cbd5e1",
        }
      : {
          trigger: "#22c55e",
          agent: "#a855f7",
          step: "#3b82f6",
          connection: "#94a3b8",
        },
    [isDarkTheme]
  );

  // ── Linked connections (mutable — auto-grows as user picks new ones) ───────

  const [linkedConnections, setLinkedConnections] = React.useState(initialLinkedConnections);

  // ── Reducer ───────────────────────────────────────────────────────────────

  const [state, dispatch] = useReducer(
    editorReducer,
    { ...initialEditorState(initialSchema), validationResult: initialValidation }
  );

  // ── Panel visibility ──────────────────────────────────────────────────────

  const [showHistory, setShowHistory] = React.useState(false);
  const [showPalette, setShowPalette] = React.useState(false);
  const [showAiEdit, setShowAiEdit] = React.useState(false);
  const [showRawSchema, setShowRawSchema] = React.useState(false);
  const [showDebugger, setShowDebugger] = React.useState(false);
  const [rawSchemaEnabled] = useRawSchemaMode();
  const [contextMenu, setContextMenu] = React.useState<EditorContextMenu>(null);
  const [contextAddPosition, setContextAddPosition] = React.useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-editor-context-menu]")) return;
      setContextMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [contextMenu]);

  // ── AI edit state ─────────────────────────────────────────────────────────

  const [aiEditPrompt, setAiEditPrompt] = React.useState("");
  const [aiEditLoading, setAiEditLoading] = React.useState(false);
  const [aiEditError, setAiEditError] = React.useState<string | null>(null);
  const [aiEditMode, setAiEditMode] = React.useState<"personal" | "platform">("personal");

  const [isValidating, setIsValidating] = React.useState(false);
  const [validationNotice, setValidationNotice] = React.useState<string | null>(null);
  const [preFlightChecks, setPreFlightChecks] = React.useState<PreFlightCheck[] | null>(null);
  const [isComplianceBlock, setIsComplianceBlock] = React.useState(false);
  const [applyingFixNodeId, setApplyingFixNodeId] = React.useState<string | null>(null);
  const [acknowledgingProvider, setAcknowledgingProvider] = React.useState<string | null>(null);

  useEffect(() => {
    if (!validationNotice) return;

    const timer = setTimeout(() => {
      setValidationNotice(null);
    }, 4500);

    return () => clearTimeout(timer);
  }, [validationNotice]);

  // ── Clipboard for copy/paste ──────────────────────────────────────────────

  const clipboardRef = useRef<SchemaNode | null>(null);

  // ── React Flow controlled state ───────────────────────────────────────────
  // We maintain separate RF node/edge state to pass into ReactFlow.
  // It is re-synced whenever state.schema changes.

  const [rfNodes, setRfNodes] = React.useState<ReactFlowNode[]>(() => {
    const { nodes } = toReactFlow(initialSchema, initialValidation);
    return needsLayout(nodes)
      ? applyDagreLayout(
          nodes,
          toReactFlow(initialSchema, initialValidation).edges
        )
      : nodes;
  });

  const [rfEdges, setRfEdges] = React.useState<ReactFlowEdge[]>(() => {
    return toReactFlow(initialSchema, initialValidation).edges;
  });
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  // ── Auto-layout direction (user preference, persisted) ───────────────────
  const [layoutDirection, setLayoutDirection] = React.useState<LayoutDirection>(() => {
    if (typeof window === "undefined") return DEFAULT_LAYOUT_DIRECTION;
    const stored = window.localStorage.getItem("flowos.layoutDirection");
    return stored === "horizontal" || stored === "vertical" ? stored : DEFAULT_LAYOUT_DIRECTION;
  });

  const handleAutoLayout = React.useCallback(
    (direction: LayoutDirection) => {
      setLayoutDirection(direction);
      try {
        window.localStorage.setItem("flowos.layoutDirection", direction);
      } catch {
        // best-effort; preference just won't persist
      }
      const nodes = layoutSchema(state.schema.nodes, state.schema.edges, direction);
      // RESTORE_VERSION replaces the schema, marks it dirty (auto-save persists),
      // and is undoable — so the re-arrange can be reverted with Cmd+Z.
      dispatch({ type: "RESTORE_VERSION", schema: { ...state.schema, nodes } });
      // Fit the view once the schema→RF sync has applied the new positions.
      setTimeout(() => {
        try {
          reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 400 });
        } catch {
          // no-op if canvas not ready
        }
      }, 60);
    },
    [state.schema, dispatch]
  );

  // ── Sync schema → RF nodes/edges when schema changes ─────────────────────
  // We skip the sync when the change originated from RF (to avoid loops).
  // We also preserve live execution statuses so a schema sync (e.g. auto-save
  // validation) doesn't overwrite the running/success/failed indicators.
  const skipSyncRef = useRef(false);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    const { nodes, edges } = toReactFlow(state.schema, state.validationResult);

    setRfNodes((prev) => {
      const execStatus = new Map(
        prev
          .filter((n) => n.data.status && n.data.status !== "idle")
          .map((n) => [n.id, n.data.status as string])
      );
      if (execStatus.size === 0) return nodes;
      return nodes.map((n) => {
        const s = execStatus.get(n.id);
        return s ? { ...n, data: { ...n.data, status: s } } : n;
      });
    });

    setRfEdges((prev) => {
      const edgeData = new Map(
        prev
          .filter((e) => (e.data as Record<string, unknown> | undefined)?.sourceStatus)
          .map((e) => [e.id, e.data])
      );
      if (edgeData.size === 0) return edges;
      return edges.map((e) => {
        const d = edgeData.get(e.id);
        return d ? { ...e, data: { ...e.data, ...d } } : e;
      });
    });
  }, [state.schema, state.validationResult]);

  // ── Auto-save (2s debounce) ───────────────────────────────────────────────

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schemaRef = useRef(state.schema);
  schemaRef.current = state.schema;

  useEffect(() => {
    if (!state.isDirty) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      await performSave(schemaRef.current);
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isDirty, state.schema]);

  // ── Save function ─────────────────────────────────────────────────────────

  const performSave = useCallback(
    async (schema: ProgramSchema): Promise<boolean> => {
      dispatch({ type: "SET_SAVING", saving: true });
      try {
        const res = await fetch(`/api/programs/${programId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schema }),
        });
        const body = await res.json().catch(() => null) as {
          validation?: ValidationResult;
          error?: string;
          message?: string;
        } | null;

        if (res.ok) {
          if (body?.validation) {
            dispatch({ type: "SET_VALIDATION", result: body.validation });
            const issueCount = body.validation.errors.length + body.validation.warnings.length;
            setValidationNotice(
              issueCount > 0
                ? `Draft saved with ${issueCount} validation warning${issueCount === 1 ? "" : "s"}.`
                : "Draft saved."
            );
          } else {
            setValidationNotice("Draft saved.");
          }
          dispatch({ type: "MARK_SAVED" });
          return true;
        } else {
          const message = friendlyResponseMessage(body, "We could not save your changes. Please try again.");
          setValidationNotice(message);
          setPreFlightChecks([
            makePreFlightErrorCheck(
              "Save failed",
              message,
              "Review the draft and try Save again."
            ),
          ]);
          dispatch({ type: "SET_SAVING", saving: false });
          return false;
        }
      } catch {
        setValidationNotice("We could not connect while saving.");
        setPreFlightChecks([
          makePreFlightErrorCheck(
            "Save failed",
            "We could not connect while saving.",
            "Check your internet connection and try Save again."
          ),
        ]);
        dispatch({ type: "SET_SAVING", saving: false });
        return false;
      }
    },
    [programId]
  );

  // ── Validate ──────────────────────────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setValidationNotice(null);
    setPreFlightChecks(null);

    try {
      const result = validatePostGenesis(state.schema, allConnections);
      dispatch({ type: "SET_VALIDATION", result });

      const firstNodeIssue =
        result.errors.find((error) => error.node_id)?.node_id ??
        result.warnings.find((warning) => warning.node_id)?.node_id;

      if (firstNodeIssue) {
        dispatch({ type: "SELECT_NODE", nodeId: firstNodeIssue });
      }

      if (!result.valid) {
        const issueCount = result.errors.length;
        setValidationNotice(
          `Found ${issueCount} validation issue${issueCount === 1 ? "" : "s"}.`
        );
        setPreFlightChecks([
          {
            code: "PRE_005",
            label: "Schema validation",
            status: "fail",
            failures: result.errors.map((error) => ({
              node_id: error.node_id,
              message: error.message,
              fix_suggestion: error.fix_suggestion,
            })),
          },
        ]);
        return;
      }

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      if (state.isDirty) {
        const saved = await performSave(state.schema);
        if (!saved) {
          setValidationNotice("We could not check the workflow because saving failed.");
          setPreFlightChecks([
            makePreFlightErrorCheck(
              "Save failed",
              "We could not save your latest changes before checking the workflow.",
              "Check your internet connection and try again."
            ),
          ]);
          return;
        }
      }

      const res = await fetch(`/api/programs/${programId}/preflight`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as {
        result?: ValidationResult;
        checks?: PreFlightCheck[];
        error?: string;
      } | null;

      if (!res.ok) {
        const message = friendlyResponseMessage(body, "We could not check the workflow. Please try again.");
        setValidationNotice("We could not check the workflow.");
        setPreFlightChecks([
          makePreFlightErrorCheck(
            "Check failed",
            message,
            "Save your changes, check your internet connection, and try again."
          ),
        ]);
        return;
      }

      if (body?.result) {
        dispatch({ type: "SET_VALIDATION", result: body.result });
      }

      const checks = body?.checks ?? [];
      const failedChecks = checks.filter((check) => check.status === "fail");
      if (failedChecks.length > 0) {
        setPreFlightChecks(checks);
        setValidationNotice(
          `We found ${failedChecks.length} issue${failedChecks.length === 1 ? "" : "s"} to fix before this can run.`
        );
        return;
      }

      const warningCount = body?.result?.warnings.length ?? result.warnings.length;
      setValidationNotice(
        warningCount > 0
          ? `Validation passed with ${warningCount} warning${warningCount === 1 ? "" : "s"}.`
          : "Validation passed. Ready to run."
      );
    } catch {
      setValidationNotice("We could not check the workflow.");
      setPreFlightChecks([
        makePreFlightErrorCheck(
          "Connection problem",
          "We could not connect to Corelyx.",
          "Check your internet connection and try again."
        ),
      ]);
    } finally {
      setIsValidating(false);
    }
  }, [allConnections, performSave, programId, state.isDirty, state.schema]);

  // Re-validate whenever linkedConnections grows (e.g. after auto-linking)
  useEffect(() => {
    const result = validatePostGenesis(state.schema, linkedConnections);
    dispatch({ type: "SET_VALIDATION", result });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedConnections]);

  const duplicateNode = useCallback(
    (nodeId: string, position?: { x: number; y: number }) => {
      const src = state.schema.nodes.find((node) => node.id === nodeId);
      if (!src) return;

      const newId = crypto.randomUUID();
      const newNode: SchemaNode = {
        ...src,
        id: newId,
        label: `${src.label} (copy)`,
        position: position ?? { x: src.position.x + 40, y: src.position.y + 40 },
        status: "idle",
      } as SchemaNode;

      dispatch({ type: "UPDATE_NODE", nodeId: newId, patch: newNode });
      dispatch({ type: "SELECT_NODE", nodeId: newId });
      skipSyncRef.current = true;
      setRfNodes((prev) => [...prev, schemaNodeToReactFlowNode(newNode)]);
    },
    [state.schema.nodes]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === "s") {
        e.preventDefault();
        performSave(schemaRef.current);
        return;
      }

      if (meta && e.shiftKey && e.key === "z") {
        e.preventDefault();
        dispatch({ type: "REDO" });
        return;
      }

      if (meta && e.key === "z") {
        e.preventDefault();
        dispatch({ type: "UNDO" });
        return;
      }

      // Copy: Cmd+C — write to both in-memory ref AND persistent localStorage clipboard
      if (meta && e.key === "c") {
        if (isInputFocused()) return; // let browser handle text copy
        if (state.selectedNodeId) {
          const node = state.schema.nodes.find((n) => n.id === state.selectedNodeId);
          if (node) {
            clipboardRef.current = node;
            // Cross-workflow clipboard: collect connected edges between copied nodes
            const copiedIds = new Set([node.id]);
            const relatedEdges = state.schema.edges.filter(
              (edge) => copiedIds.has(edge.from) && copiedIds.has(edge.to)
            );
            writeClipboard({ nodes: [node], edges: relatedEdges });
          }
        }
        return;
      }

      // Paste: Cmd+V — prefer localStorage clipboard (cross-workflow) over in-memory
      if (meta && e.key === "v") {
        if (isInputFocused()) return;
        const persistent = readClipboard();
        if (persistent) {
          const pasted = buildPastePayload(persistent);
          pasted.nodes.forEach((node) => {
            dispatch({ type: "UPDATE_NODE", nodeId: node.id, patch: node });
            skipSyncRef.current = false;
          });
          pasted.edges.forEach((edge) => {
            dispatch({ type: "ADD_EDGE", edge });
          });
          if (pasted.nodes.length === 1) {
            dispatch({ type: "SELECT_NODE", nodeId: pasted.nodes[0].id });
          }
        } else if (clipboardRef.current) {
          duplicateNode(clipboardRef.current.id);
        }
        return;
      }

      if (e.key === "Escape") {
        setContextMenu(null);
        dispatch({ type: "SELECT_NODE", nodeId: null });
        dispatch({ type: "SELECT_EDGE", edgeId: null });
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && !isInputFocused()) {
        if (state.selectedNodeId) {
          dispatch({ type: "REMOVE_NODE", nodeId: state.selectedNodeId });
          skipSyncRef.current = true;
          setRfNodes((prev) => prev.filter((n) => n.id !== state.selectedNodeId));
          setRfEdges((prev) =>
            prev.filter(
              (e) => e.source !== state.selectedNodeId && e.target !== state.selectedNodeId
            )
          );
        } else if (state.selectedEdgeId) {
          dispatch({ type: "REMOVE_EDGE", edgeId: state.selectedEdgeId });
          skipSyncRef.current = true;
          setRfEdges((prev) => prev.filter((e) => e.id !== state.selectedEdgeId));
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    state.selectedNodeId,
    state.selectedEdgeId,
    state.schema.nodes,
    state.schema.edges,
    duplicateNode,
    performSave,
  ]);

  // ── Realtime + polling for the active run ────────────────────────────────
  // Subscribes to node_executions filtered by run_id (reliable) and falls
  // back to 2 s polling so the graph always reflects live execution state.

  const applyExecRow = React.useCallback(
    (row: {
      node_id: string;
      status: SchemaNode["status"];
      input_payload?: unknown;
      output_payload?: unknown;
      error_message?: string | null;
      started_at?: string | null;
      completed_at?: string | null;
      retry_count?: number | null;
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      estimated_cost_usd?: number;
      connector_api_calls?: number;
      model_call_count?: number;
      created_at?: string;
    }) => {
      if (!row.node_id || !row.status) return;

      // Patch RF node status (skip schema-sync on next tick)
      skipSyncRef.current = true;
      setRfNodes((prev) =>
        prev.map((n) =>
          n.id === row.node_id ? { ...n, data: { ...n.data, status: row.status } } : n
        )
      );

      // Patch outgoing edges with sourceStatus so they colour correctly
      setRfEdges((prev) =>
        prev.map((e) =>
          e.source === row.node_id
            ? { ...e, data: { ...(e.data ?? {}), sourceStatus: row.status } }
            : e
        )
      );

      // Update drawer / inspector data
      setNodeExecutions((prev) => ({
        ...prev,
        [row.node_id]: {
          status: row.status,
          input_payload: row.input_payload ?? null,
          output_payload: row.output_payload ?? null,
          error_message: row.error_message ?? null,
          started_at: row.started_at ?? null,
          completed_at: row.completed_at ?? null,
          retry_count: row.retry_count ?? null,
          prompt_tokens: Number(row.prompt_tokens ?? 0),
          completion_tokens: Number(row.completion_tokens ?? 0),
          total_tokens: Number(row.total_tokens ?? 0),
          estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
          connector_api_calls: Number(row.connector_api_calls ?? 0),
          model_call_count: Number(row.model_call_count ?? 0),
          created_at: row.created_at ?? new Date(0).toISOString(),
        },
      }));
    },
    []
  );

  const [nodeExecutions, setNodeExecutions] = React.useState<Record<string, NodeExecutionData>>({});
  const [lastRunId, setLastRunId] = React.useState<string | null>(null);
  const [showRunLog, setShowRunLog] = React.useState(false);
  const [currentRunStatus, setCurrentRunStatus] = React.useState("idle");
  const [currentRunStartedAt, setCurrentRunStartedAt] = React.useState<string | null>(null);

  // Ref mirror so the poll interval always reads the latest status without
  // needing to be recreated on every status change (avoids stale closure bug).
  const currentRunStatusRef = React.useRef(currentRunStatus);
  React.useEffect(() => { currentRunStatusRef.current = currentRunStatus; }, [currentRunStatus]);

  useEffect(() => {
    if (!lastRunId) return;
    const supabase = createBrowserClient();
    // Covers both runtime values ("completed", "cancelled") and schema-defined
    // terminal states ("success", "partial") so the poll stops regardless of
    // which value the runtime or a future code path writes.
    const TERMINAL_STATUSES = new Set(["completed", "success", "partial", "failed", "cancelled"]);

    const fetchExecs = async () => {
      const { data } = await supabase
        .from("node_executions")
        .select("*")
        .eq("run_id", lastRunId);
      if (data) {
        for (const row of data) applyExecRow(row as Parameters<typeof applyExecRow>[0]);
      }
    };

    const fetchRunStatus = async () => {
      const { data } = await supabase
        .from("runs")
        .select("status, started_at")
        .eq("id", lastRunId)
        .maybeSingle();
      const row = data as { status?: string | null; started_at?: string | null } | null;
      if (row?.status) setCurrentRunStatus(row.status);
      if (row?.started_at) setCurrentRunStartedAt(row.started_at);
    };

    void fetchExecs();
    void fetchRunStatus();

    const channel = supabase
      .channel(`editor-run-execs-${lastRunId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "node_executions", filter: `run_id=eq.${lastRunId}` },
        (payload) => applyExecRow(payload.new as Parameters<typeof applyExecRow>[0])
      )
      .subscribe();

    const poll = setInterval(() => {
      if (TERMINAL_STATUSES.has(currentRunStatusRef.current)) {
        clearInterval(poll);
        return;
      }
      void fetchExecs();
      void fetchRunStatus();
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRunId]);

  // ── RF event handlers ─────────────────────────────────────────────────────

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((nds) => applyNodeChanges(changes, nds));

      // Sync positions to schema only after drag ends.
      // React Flow emits many "position" changes while dragging (dragging=true);
      // writing schema on each tick causes full graph re-sync and UI jank.
      const finalPositionChanges = changes.filter(
        (
          c
        ): c is NodeChange & {
          type: "position";
          position: { x: number; y: number };
          dragging?: boolean;
        } => c.type === "position" && c.position != null && c.dragging !== true
      );
      if (finalPositionChanges.length > 0) {
        const latestByNodeId = new Map<string, { x: number; y: number }>();
        for (const change of finalPositionChanges) {
          latestByNodeId.set(change.id, change.position);
        }
        // Positions already applied to RF state above — skip the schema→RF sync
        // that would otherwise rebuild all nodes from toReactFlow() needlessly.
        skipSyncRef.current = true;
        dispatch({
          type: "SET_POSITIONS",
          nodes: Array.from(latestByNodeId.entries()).map(([id, position]) => ({
            id,
            position,
          })),
        });
      }

      // Sync node dimensions back to schema config (group frames + resizable notes)
      const dimensionChanges = changes.filter(
        (c): c is NodeChange & { type: "dimensions"; dimensions?: { width: number; height: number }; resizing?: boolean } =>
          c.type === "dimensions" && (c as { resizing?: boolean }).resizing === false
      );
      dimensionChanges.forEach((c) => {
        const dims = (c as { dimensions?: { width: number; height: number } }).dimensions;
        if (dims) {
          dispatch({
            type: "UPDATE_NODE_CONFIG",
            nodeId: c.id,
            config: { width: dims.width, height: dims.height },
          });
        }
      });

      // Handle node removal initiated from RF (e.g. backspace while node selected in RF)
      const removeChanges = changes.filter((c) => c.type === "remove");
      removeChanges.forEach((c) => {
        dispatch({ type: "REMOVE_NODE", nodeId: c.id });
      });
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setRfEdges((eds) => applyEdgeChanges(changes, eds));

      const removeChanges = changes.filter((c) => c.type === "remove");
      removeChanges.forEach((c) => {
        dispatch({ type: "REMOVE_EDGE", edgeId: c.id });
      });
    },
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge: ReactFlowEdge = {
        id: crypto.randomUUID(),
        source: connection.source ?? "",
        target: connection.target ?? "",
        type: "data_flow",
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { condition: null, data_mapping: null, validationErrors: [] },
      };

      setRfEdges((eds) => addEdge(newEdge, eds));

      dispatch({
        type: "ADD_EDGE",
        edge: {
          id: newEdge.id,
          from: newEdge.source,
          to: newEdge.target,
          type: "data_flow",
          data_mapping: null,
          condition: null,
          label: null,
        },
      });
    },
    []
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: ReactFlowNode) => {
      setContextMenu(null);
      dispatch({ type: "SELECT_NODE", nodeId: node.id });
    },
    []
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: ReactFlowEdge) => {
      event.preventDefault();
      setContextMenu({ kind: "edge", edgeId: edge.id, x: event.clientX, y: event.clientY });
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    dispatch({ type: "SELECT_NODE", nodeId: null });
    dispatch({ type: "SELECT_EDGE", edgeId: null });
  }, []);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: ReactFlowNode) => {
      event.preventDefault();
      dispatch({ type: "SELECT_NODE", nodeId: node.id });
      setContextMenu({ kind: "node", nodeId: node.id, x: event.clientX, y: event.clientY });
    },
    []
  );

  const onPaneContextMenu = useCallback(
    (event: globalThis.MouseEvent | React.MouseEvent<Element, globalThis.MouseEvent>) => {
      event.preventDefault();
      const flowPosition = reactFlowInstanceRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) ?? { x: event.clientX, y: event.clientY };
      dispatch({ type: "SELECT_NODE", nodeId: null });
      dispatch({ type: "SELECT_EDGE", edgeId: null });
      setContextMenu({
        kind: "pane",
        x: event.clientX,
        y: event.clientY,
        flowPosition: {
          x: Math.round(flowPosition.x),
          y: Math.round(flowPosition.y),
        },
      });
    },
    []
  );

  // ── Add node from palette ─────────────────────────────────────────────────

  const addNodeAtPosition = useCallback(
    (variant: NodeVariant, position: { x: number; y: number }) => {
      const id = crypto.randomUUID();
      const schemaNode = makeDefaultNode(variant, id, position);

      dispatch({ type: "UPDATE_NODE", nodeId: id, patch: schemaNode });
      dispatch({ type: "SELECT_NODE", nodeId: id });

      skipSyncRef.current = true;
      setRfNodes((prev) => [...prev, schemaNodeToReactFlowNode(schemaNode)]);
    },
    []
  );

  // Create a new node of `variant` directly below `sourceId` and connect them.
  // Powers the per-node "+" add button.
  const addConnectedNode = useCallback(
    (sourceId: string, variant: NodeVariant) => {
      const src = state.schema.nodes.find((node) => node.id === sourceId);
      const position = src
        ? { x: src.position.x, y: src.position.y + 150 }
        : { x: 380, y: 240 };

      const id = crypto.randomUUID();
      const schemaNode = makeDefaultNode(variant, id, position);
      const edgeId = crypto.randomUUID();

      dispatch({ type: "UPDATE_NODE", nodeId: id, patch: schemaNode });
      dispatch({
        type: "ADD_EDGE",
        edge: { id: edgeId, from: sourceId, to: id, type: "data_flow", data_mapping: null, condition: null, label: null },
      });
      dispatch({ type: "SELECT_NODE", nodeId: id });

      skipSyncRef.current = true;
      setRfNodes((prev) => [...prev, schemaNodeToReactFlowNode(schemaNode)]);
      setRfEdges((prev) =>
        addEdge(
          {
            id: edgeId,
            source: sourceId,
            target: id,
            type: "data_flow",
            markerEnd: { type: MarkerType.ArrowClosed },
            data: { condition: null, data_mapping: null, validationErrors: [] },
          },
          prev,
        ),
      );
    },
    [state.schema.nodes]
  );

  const canvasActions = React.useMemo(() => ({ addConnectedNode }), [addConnectedNode]);

  // Split a connection: drop a new step node between the edge's source and target.
  const insertNodeOnEdge = useCallback(
    (edgeId: string) => {
      const edge = state.schema.edges.find((e) => e.id === edgeId);
      if (!edge) return;

      const fromNode = state.schema.nodes.find((n) => n.id === edge.from);
      const toNode = state.schema.nodes.find((n) => n.id === edge.to);
      const position =
        fromNode && toNode
          ? { x: (fromNode.position.x + toNode.position.x) / 2, y: (fromNode.position.y + toNode.position.y) / 2 }
          : fromNode
            ? { x: fromNode.position.x, y: fromNode.position.y + 150 }
            : { x: 380, y: 240 };

      const id = crypto.randomUUID();
      const schemaNode = makeDefaultNode({ type: "step", subtype: "transform" }, id, position);
      const e1 = crypto.randomUUID();
      const e2 = crypto.randomUUID();
      const mkEdge = (eid: string, from: string, to: string): ReactFlowEdge => ({
        id: eid,
        source: from,
        target: to,
        type: "data_flow",
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { condition: null, data_mapping: null, validationErrors: [] },
      });

      dispatch({ type: "REMOVE_EDGE", edgeId });
      dispatch({ type: "UPDATE_NODE", nodeId: id, patch: schemaNode });
      dispatch({ type: "ADD_EDGE", edge: { id: e1, from: edge.from, to: id, type: "data_flow", data_mapping: null, condition: null, label: null } });
      dispatch({ type: "ADD_EDGE", edge: { id: e2, from: id, to: edge.to, type: "data_flow", data_mapping: null, condition: null, label: null } });
      dispatch({ type: "SELECT_NODE", nodeId: id });

      skipSyncRef.current = true;
      setRfNodes((prev) => [...prev, schemaNodeToReactFlowNode(schemaNode)]);
      setRfEdges((prev) => {
        const without = prev.filter((e) => e.id !== edgeId);
        return addEdge(mkEdge(e2, id, edge.to), addEdge(mkEdge(e1, edge.from, id), without));
      });
    },
    [state.schema.edges, state.schema.nodes]
  );

  const handleAddNode = useCallback(
    (variant: NodeVariant) => {
      if (contextAddPosition) {
        addNodeAtPosition(variant, contextAddPosition);
        setContextAddPosition(null);
        setShowPalette(false);
        return;
      }

      // Stagger new nodes slightly so rapid additions don't stack.
      const offset = Math.floor(Math.random() * 60) - 30;
      addNodeAtPosition(variant, { x: 380 + offset, y: 200 + offset });
    },
    [addNodeAtPosition, contextAddPosition]
  );

  const handlePaletteDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, variant: NodeVariant) => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-flowos-node", JSON.stringify(variant));
    },
    []
  );

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleCanvasDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const payload = event.dataTransfer.getData("application/x-flowos-node");
      if (!payload) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        return;
      }

      if (!isNodeVariant(parsed)) return;

      const flowPosition = reactFlowInstanceRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) ?? {
        x: event.clientX - event.currentTarget.getBoundingClientRect().left,
        y: event.clientY - event.currentTarget.getBoundingClientRect().top,
      };

      addNodeAtPosition(parsed, {
        x: Math.round(flowPosition.x - 100),
        y: Math.round(flowPosition.y - 40),
      });
    },
    [addNodeAtPosition]
  );

  // ── Sidebar config update ─────────────────────────────────────────────────

  const handleSidebarUpdate = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      // Separate top-level node fields from config fields
      const { label, description, connection, ...configPatch } = config;

      if (label !== undefined || description !== undefined || connection !== undefined) {
        // Patch the RF node directly so label/connection badge updates are instant,
        // then skip the schema→RF sync that would otherwise call toReactFlow() for
        // every keystroke and re-render every node on the canvas.
        skipSyncRef.current = true;
        setRfNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    ...(label !== undefined ? { label } : {}),
                    ...(description !== undefined ? { description } : {}),
                    ...(connection !== undefined ? { connection } : {}),
                  },
                }
              : n
          )
        );

        dispatch({
          type: "UPDATE_NODE",
          nodeId,
          patch: {
            ...(label !== undefined ? { label: label as string } : {}),
            ...(description !== undefined ? { description: description as string } : {}),
            ...(connection !== undefined ? { connection: connection as string | null } : {}),
          },
        });

        // Auto-link a newly selected connection to this program
        if (connection && typeof connection === "string") {
          const alreadyLinked = linkedConnections.some((c) => c.name === connection);
          if (!alreadyLinked) {
            const picked = allConnections.find((c) => c.name === connection);
            if (picked) {
              // Optimistic update
              setLinkedConnections((prev) => [...prev, picked]);
              // Persist to DB
              fetch(`/api/programs/${programId}/connections`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ connection_id: picked.id }),
              }).catch(() => {
                // Revert on failure
                setLinkedConnections((prev) => prev.filter((c) => c.id !== picked.id));
              });
            }
          }
        }
      }

      if (Object.keys(configPatch).length > 0) {
        // Config values aren't rendered on the canvas — skip the schema→RF sync.
        skipSyncRef.current = true;
        dispatch({ type: "UPDATE_NODE_CONFIG", nodeId, config: configPatch });
      }
    },
    [programId, linkedConnections, allConnections]
  );

  // ── Node execution inspector state ───────────────────────────────────────

  // ── Run log drawer state ──────────────────────────────────────────────────

  // On mount: fetch most recent run and populate nodeExecutions
  useEffect(() => {
    async function fetchLatestRun() {
      try {
        const listRes = await fetch(`/api/runs?program_id=${programId}`);
        if (!listRes.ok) return;
        const runs = await listRes.json() as Array<{ id: string }>;
        if (!runs || runs.length === 0) return;
        const runId = runs[0].id;
        setLastRunId(runId);

        const runRes = await fetch(`/api/runs/${runId}`);
        if (!runRes.ok) return;
        const run = await runRes.json() as { node_executions?: Array<{
          node_id: string;
          status: SchemaNode["status"];
          input_payload: unknown;
          output_payload: unknown;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          retry_count?: number | null;
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          estimated_cost_usd?: number;
          connector_api_calls?: number;
          model_call_count?: number;
          created_at?: string;
        }> };
        if (!run.node_executions) return;

        const byNodeId: Record<string, NodeExecutionData> = {};
        for (const ne of run.node_executions) {
          byNodeId[ne.node_id] = {
            status: ne.status,
            input_payload: ne.input_payload,
            output_payload: ne.output_payload,
            error_message: ne.error_message,
            started_at: ne.started_at,
            completed_at: ne.completed_at,
            retry_count: ne.retry_count ?? null,
            prompt_tokens: Number(ne.prompt_tokens ?? 0),
            completion_tokens: Number(ne.completion_tokens ?? 0),
            total_tokens: Number(ne.total_tokens ?? 0),
            estimated_cost_usd: Number(ne.estimated_cost_usd ?? 0),
            connector_api_calls: Number(ne.connector_api_calls ?? 0),
            model_call_count: Number(ne.model_call_count ?? 0),
            created_at: ne.created_at ?? new Date(0).toISOString(),
          };
        }
        setNodeExecutions(byNodeId);
      } catch {
        // Non-critical — silently ignore
      }
    }
    fetchLatestRun();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  // ── Subscribe to run status when lastRunId changes ───────────────────────

  useEffect(() => {
    if (!lastRunId) return;
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`run-status-${lastRunId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "runs", filter: `id=eq.${lastRunId}` },
        (payload) => {
          const row = payload.new as { status?: string } | null;
          if (row?.status) setCurrentRunStatus(row.status);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [lastRunId]);

  // ── Webhook test state ────────────────────────────────────────────────────

  const requiresTriggerPayload = React.useMemo(
    () => workflowRequiresPayloadForManualRun(state.schema),
    [state.schema]
  );

  const [showWebhookTest, setShowWebhookTest] = React.useState(false);
  const [webhookPayload, setWebhookPayload] = React.useState('{\n  \n}');
  // The default payload above is already a valid (empty) JSON object.
  const [webhookPayloadValid, setWebhookPayloadValid] = React.useState(true);

  // Validate JSON on every keystroke
  const handleWebhookPayloadChange = React.useCallback((value: string) => {
    setWebhookPayload(value);
    try {
      setWebhookPayloadValid(isJsonObject(JSON.parse(value)));
    } catch {
      setWebhookPayloadValid(false);
    }
  }, []);

  // ── AI edit submit ────────────────────────────────────────────────────────

  const PROVIDER_PRIORITY: Record<string, number> = {
    anthropic: 0, openai: 1, openrouter: 2, mistral: 3, google: 4, groq: 5,
  };
  const DEFAULT_MODELS: Record<string, string> = {
    anthropic: "claude-sonnet-4-6",
    openai: "gpt-4o",
    google: "gemini-1.5-pro",
    groq: "llama-3.3-70b-versatile",
    mistral: "mistral-large-latest",
    openrouter: "openai/gpt-oss-120b:free",
  };

  const handleAiEditSubmit = useCallback(async () => {
    const prompt = aiEditPrompt.trim();
    if (!prompt) return;

    // Ask for notification permission now so we can alert the user if they
    // switch tabs while the AI edit is running.
    requestNotificationPermission();

    setAiEditLoading(true);
    setAiEditError(null);

    let requestBody: Record<string, unknown>;

    if (aiEditMode === "platform") {
      requestBody = {
        description: state.schema.program_name,
        connection_ids: linkedConnections.map((c) => c.id),
        use_platform_key: true,
        existing_schema: state.schema,
        refinement: prompt,
        existing_program_id: programId,
      };
    } else {
      const bestKey = [...apiKeys].sort(
        (a, b) => (PROVIDER_PRIORITY[a.provider] ?? 99) - (PROVIDER_PRIORITY[b.provider] ?? 99)
      )[0];

      if (!bestKey) {
        setAiEditError("Add an API key, or switch to Corelyx AI to edit this workflow.");
        setAiEditLoading(false);
        return;
      }

      const model = DEFAULT_MODELS[bestKey.provider] ?? "claude-sonnet-4-6";
      requestBody = {
        description: state.schema.program_name,
        connection_ids: linkedConnections.map((c) => c.id),
        api_key_id: bestKey.id,
        model,
        existing_schema: state.schema,
        refinement: prompt,
        existing_program_id: programId,
      };
    }

    try {
      const res = await fetch("/api/genesis/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok || !res.body) {
        let message = "The AI edit did not work. Please try again.";
        try {
          const body = await res.clone().json() as { error?: string; message?: string } | null;
          if (typeof body?.message === "string") message = body.message;
          else if (typeof body?.error === "string") message = body.error;
        } catch { /* keep default */ }
        setAiEditError(message);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Local accumulators — flushed to canvas on rAF so bursts of events
      // produce one Dagre relayout + one React render, not one per node.
      let streamNodes: ReactFlowNode[] = [];
      let streamEdges: ReactFlowEdge[] = [];
      let firstNodeSeen = false;
      let pendingRaf = false;

      const flushCanvas = () => {
        if (pendingRaf) return;
        pendingRaf = true;
        requestAnimationFrame(() => {
          pendingRaf = false;
          const laid = applyDagreLayout(streamNodes, streamEdges, "TB");
          streamNodes = laid;
          setRfNodes([...laid]);
          setRfEdges([...streamEdges]);
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          let event: Record<string, unknown>;
          try { event = JSON.parse(dataLine.slice(6)); } catch { continue; }

          if (event.type === "node") {
            const node = event.node as Record<string, unknown> | null;
            if (!node?.id) continue;
            if (streamNodes.some((n) => n.id === node.id)) continue;

            if (!firstNodeSeen) {
              firstNodeSeen = true;
              streamNodes = [];
              streamEdges = [];
            }

            const cfg = (node.config as Record<string, unknown>) ?? {};
            const nodeType = String(node.type ?? "step");
            const rfNode: ReactFlowNode = {
              id: String(node.id),
              type: nodeType,
              position: (node.position as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
              draggable: true,
              selectable: true,
              data: {
                label: node.label ?? node.id,
                description: node.description ?? "",
                connection: node.connection ?? null,
                status: "idle",
                config: cfg,
                validationState: "valid",
                errors: [],
                warnings: [],
              },
              zIndex: nodeType === "group" ? 0 : nodeType === "note" ? 1000 : 1,
              ...(nodeType === "note"
                ? { dragHandle: ".note-drag-handle", style: { width: 200, height: 120 } }
                : {}),
              ...(nodeType === "group"
                ? { style: { width: (cfg.width as number) ?? 300, height: (cfg.height as number) ?? 200 } }
                : {}),
              ...(node.parentId ? { parentId: String(node.parentId), extent: "parent" as const } : {}),
            };
            streamNodes = [...streamNodes, rfNode];
            flushCanvas();
          } else if (event.type === "edge") {
            const edge = event.edge as Record<string, unknown> | null;
            if (!edge?.id || !edge?.from || !edge?.to) continue;
            if (streamEdges.some((e) => e.id === edge.id)) continue;
            const rfEdge: ReactFlowEdge = {
              id: String(edge.id),
              source: String(edge.from),
              target: String(edge.to),
              type: String(edge.type ?? "data_flow"),
              animated: edge.type === "event_subscription",
              markerEnd: { type: MarkerType.ArrowClosed },
              data: { condition: null, data_mapping: null, validationErrors: [] },
            };
            streamEdges = [...streamEdges, rfEdge];
            flushCanvas();
          } else if (event.type === "done") {
            if (event.schema) {
              dispatch({ type: "RESTORE_VERSION", schema: event.schema as ProgramSchema });
            }
            if (event.validation) {
              dispatch({ type: "SET_VALIDATION", result: event.validation as ValidationResult });
            }
            setValidationNotice("AI edit applied. Review and save the draft.");
            setShowAiEdit(false);
            setAiEditPrompt("");
            notifyIfHidden("Workflow edit complete", "Your AI edit is ready — switch back to review and save.");
          } else if (event.type === "error") {
            setAiEditError(typeof event.message === "string"
              ? event.message
              : "The AI edit did not work. Please try again.");
          }
        }
      }
    } catch {
      setAiEditError("We could not connect. Check your internet connection and try again.");
    } finally {
      setAiEditLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiEditMode, aiEditPrompt, apiKeys, linkedConnections, programId, state.schema]);

  // ── Run ───────────────────────────────────────────────────────────────────

  const [isRunning, setIsRunning] = React.useState(false);
  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setValidationNotice(null);
    setPreFlightChecks(null);

    try {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      if (state.isDirty) {
        const saved = await performSave(state.schema);
        if (!saved) {
          setValidationNotice("Run was not started because the draft could not be saved.");
          return;
        }
      }

      if (requiresTriggerPayload) {
        setShowWebhookTest(true);
        return;
      }

      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_id: programId }),
      });
      const body = await res.json().catch(() => null) as {
        run_id?: string;
        status?: string;
        error?: string;
        message?: string;
        checks?: PreFlightCheck[];
        compliance_checks?: ComplianceCheck[];
      } | null;

      if (body?.run_id) {
        const runError = friendlyResponseMessage(body, "The workflow could not start.");
        if (body.status === "failed") {
          setValidationNotice(`The run was created, but it could not start: ${runError}`);
        }
        // Stay on the editor; open the run log drawer instead of navigating away
        setLastRunId(body.run_id);
        setCurrentRunStatus(body.status === "failed" ? "failed" : "running");
        setCurrentRunStartedAt(new Date().toISOString());
        setNodeExecutions({});        // clear previous run's data
        setShowRunLog(true);
        return;
      }

      if (res.ok) {
        setValidationNotice("Run started, but the server did not return a run id.");
      } else if (body?.checks) {
        setIsComplianceBlock(false);
        setPreFlightChecks(body.checks as PreFlightCheck[]);
        setValidationNotice("Fix the highlighted issues before running this workflow.");
      } else if (body?.compliance_checks) {
        const blocked = body.compliance_checks.filter(
          (c) => c.status === "blocked" || c.status === "needs_reviewer"
        );
        setIsComplianceBlock(true);
        setPreFlightChecks(
          (blocked.length > 0 ? blocked : body.compliance_checks).map((c) => ({
            code: "PRE_COMPLY" as const,
            label: c.label,
            status: "fail" as const,
            failures: [{
              node_id: c.node_id ?? null,
              message: c.message,
              fix_suggestion: complianceFixSuggestion(c.id, c.status, c.details),
              remediation: complianceRemediation(c.id, c.details),
            }],
          }))
        );
        setValidationNotice("A compliance policy is blocking this run.");
      } else {
        setIsComplianceBlock(false);
        const message = friendlyResponseMessage(body, "The workflow could not start. Please try again.");
        setValidationNotice(message);
        setPreFlightChecks([{
          code: "PRE_001",
          label: "Run blocked",
          status: "fail",
          failures: [{ node_id: null, message, fix_suggestion: "" }],
        }]);
      }
    } catch {
      setValidationNotice("We could not connect to start the workflow.");
      setPreFlightChecks([{
        code: "PRE_001",
        label: "Connection problem",
        status: "fail",
        failures: [{ node_id: null, message: "We could not connect to Corelyx.", fix_suggestion: "Check your internet connection and try again." }],
      }]);
    } finally {
      setIsRunning(false);
    }
  }, [performSave, programId, requiresTriggerPayload, state.isDirty, state.schema]);

  const handleStop = useCallback(async () => {
    if (!lastRunId) return;
    try {
      await fetch(`/api/runs/${lastRunId}/cancel`, { method: "POST" });
      setCurrentRunStatus("cancelled");
      setIsRunning(false);
    } catch {
      // non-fatal — user can still navigate away
    }
  }, [lastRunId]);

  // ── Test webhook ──────────────────────────────────────────────────────────

  const handleTestWebhook = useCallback(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(webhookPayload);
    } catch {
      // Shouldn't reach here — button is disabled when invalid — but guard anyway
      return;
    }

    if (!isJsonObject(parsed)) return;

    setIsRunning(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_id: programId, trigger_payload: parsed }),
      });
      if (res.ok) {
        const { run_id } = await res.json() as { run_id: string };
        setShowWebhookTest(false);
        setLastRunId(run_id);
        setCurrentRunStatus("running");
        setCurrentRunStartedAt(new Date().toISOString());
        setNodeExecutions({});
        setShowRunLog(true);
      } else {
        const body = await res.json().catch(() => null) as {
          checks?: PreFlightCheck[];
          compliance_checks?: ComplianceCheck[];
          error?: string;
          message?: string;
        } | null;
        setShowWebhookTest(false);
        if (body?.checks) {
          setIsComplianceBlock(false);
          setPreFlightChecks(body.checks);
        } else if (body?.compliance_checks) {
          const blocked = body.compliance_checks.filter(
            (c) => c.status === "blocked" || c.status === "needs_reviewer"
          );
          setIsComplianceBlock(true);
          setPreFlightChecks(
            (blocked.length > 0 ? blocked : body.compliance_checks).map((c) => ({
              code: "PRE_COMPLY" as const,
              label: c.label,
              status: "fail" as const,
              failures: [{
                node_id: c.node_id ?? null,
                message: c.message,
                fix_suggestion: complianceFixSuggestion(c.id, c.status, c.details),
              }],
            }))
          );
        } else {
          setIsComplianceBlock(false);
          const message = friendlyResponseMessage(body, "The test run could not start. Please try again.");
          setPreFlightChecks([{
            code: "PRE_001",
            label: "Test blocked",
            status: "fail",
            failures: [{ node_id: null, message, fix_suggestion: "" }],
          }]);
        }
      }
    } catch {
      setShowWebhookTest(false);
      setPreFlightChecks([{
        code: "PRE_001",
        label: "Connection problem",
        status: "fail",
        failures: [{ node_id: null, message: "We could not connect to Corelyx.", fix_suggestion: "Check your internet connection and try again." }],
      }]);
    } finally {
      setIsRunning(false);
    }
  }, [webhookPayload, programId]);

  // ── Back navigation ───────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    router.push(`/programs/${programId}`);
  }, [router, programId]);

  // ── Viewport width detection for mobile read-only ─────────────────────────

  const [isMobile, setIsMobile] = React.useState(false);
  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── canUndo / canRedo ─────────────────────────────────────────────────────

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <EditorDispatchContext.Provider value={dispatch}>
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* First-visit guided tour of the editor controls */}
      <Suspense>
        <EditorTour />
      </Suspense>

      {/* Toolbar — fixed at top */}
      <EditorToolbar
        programId={programId}
        programName={state.schema.program_name}
        isDirty={state.isDirty}
        isSaving={state.isSaving}
        isValidating={isValidating}
        canUndo={canUndo}
        canRedo={canRedo}
        validationResult={state.validationResult}
        onUndo={() => dispatch({ type: "UNDO" })}
        onRedo={() => dispatch({ type: "REDO" })}
        isRunning={isRunning}
        onSave={() => performSave(state.schema)}
        onValidate={handleValidate}
        onRun={handleRun}
        activeRunId={currentRunStatus === "running" ? lastRunId : null}
        onStop={handleStop}
        onRename={(name) => dispatch({ type: "UPDATE_PROGRAM_NAME", name })}
        onBack={handleBack}
        showPalette={showPalette}
        onTogglePalette={() => {
          setShowPalette((v) => !v);
          if (showHistory) setShowHistory(false);
          if (showAiEdit) setShowAiEdit(false);
        }}
        onHistory={() => {
          setShowHistory((prev) => !prev);
          if (!showHistory) {
            dispatch({ type: "SELECT_NODE", nodeId: null });
            setShowPalette(false);
          }
        }}
        onAiEdit={() => {
          const opening = !showAiEdit;
          setShowAiEdit(opening);
          setAiEditError(null);
          if (opening) {
            setShowPalette(false);
            setShowRawSchema(false);
            // Default to platform mode when no personal API keys are available
            if (apiKeys.length === 0) setAiEditMode("platform");
          }
        }}
        onAutoLayout={handleAutoLayout}
        layoutDirection={layoutDirection}
        onTestWebhook={() => setShowWebhookTest(true)}
        showRawSchema={rawSchemaEnabled && showRawSchema}
        onToggleRawSchema={rawSchemaEnabled ? () => {
          const opening = !showRawSchema;
          setShowRawSchema(opening);
          if (opening) { setShowPalette(false); setShowAiEdit(false); }
        } : undefined}
        showDebugger={enableAdvancedEditor && showDebugger}
        onToggleDebugger={enableAdvancedEditor ? () => {
          setShowDebugger((v) => !v);
        } : undefined}
      />

      {/* Node palette panel — slides in from left */}
      {showPalette && !isMobile && (
        <NodePalettePanel
          onAdd={handleAddNode}
          onDragStart={handlePaletteDragStart}
          onClose={() => setShowPalette(false)}
          enableAdvancedEditor={enableAdvancedEditor}
        />
      )}

      {/* AI edit panel — slides in from left */}
      {showAiEdit && !isMobile && (
        <AiEditPanel
          prompt={aiEditPrompt}
          onPromptChange={setAiEditPrompt}
          onSubmit={() => void handleAiEditSubmit()}
          onClose={() => { setShowAiEdit(false); setAiEditError(null); }}
          loading={aiEditLoading}
          error={aiEditError}
          hasApiKeys={apiKeys.length > 0}
          mode={aiEditMode}
          onModeChange={(m: AiEditMode) => { setAiEditMode(m); setAiEditError(null); }}
          platformRateCredits={1_000}
        />
      )}

      {/* Raw schema panel — slides in from left (dev mode only) */}
      {rawSchemaEnabled && showRawSchema && !isMobile && (
        <RawSchemaPanel
          schema={state.schema}
          onApply={(schema) => {
            dispatch({ type: "RESTORE_VERSION", schema });
          }}
          onClose={() => setShowRawSchema(false)}
        />
      )}

      {/* Canvas area — below toolbar, offset left when a left panel is open.
          The grid goes on the container div itself so React Flow's colorMode
          background can't paint over it. ReactFlow is forced transparent. */}
      <div
        className="relative h-[calc(100vh-56px)] mt-14 transition-[padding-left] duration-200 editor-static-grid"
        style={{ paddingLeft: !isMobile ? (rawSchemaEnabled && showRawSchema ? 420 : showPalette ? 240 : showAiEdit ? 288 : 0) : 0 }}
      >
        {/* Mobile banner */}
        {isMobile && (
          <div className="absolute inset-x-0 top-0 z-20 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-800 dark:text-amber-300 text-center">
            The visual editor is read-only on mobile. Open on desktop to edit.
          </div>
        )}

        {/* AI edit in-progress banner — visible on the canvas while the AI call runs */}
        {aiEditLoading && (
          <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-primary/30 bg-background/95 px-4 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur">
            <svg className="animate-spin h-3.5 w-3.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            AI is editing your workflow…
          </div>
        )}

        {validationNotice && (
          <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur">
            <span>{validationNotice}</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setValidationNotice(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <NodeCanvasContext.Provider value={canvasActions}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          colorMode={isDarkTheme ? "dark" : "light"}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance;
          }}
          onNodesChange={isMobile ? undefined : onNodesChange}
          onEdgesChange={isMobile ? undefined : onEdgesChange}
          onConnect={isMobile ? undefined : onConnect}
          onNodeClick={isMobile ? undefined : onNodeClick}
          onEdgeClick={isMobile ? undefined : onEdgeClick}
          onNodeContextMenu={isMobile ? undefined : onNodeContextMenu}
          onPaneContextMenu={isMobile ? undefined : onPaneContextMenu}
          onPaneClick={onPaneClick}
          onMoveStart={() => setContextMenu(null)}
          onDragOver={isMobile ? undefined : handleCanvasDragOver}
          onDrop={isMobile ? undefined : handleCanvasDrop}
          nodesDraggable={!isMobile}
          nodesConnectable={!isMobile}
          elementsSelectable={!isMobile}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: "data_flow",
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
          connectionLineStyle={{
            stroke: "#60a5fa",
            strokeWidth: 2,
            opacity: 0.75,
          }}
          className="relative z-10"
          style={{ background: "transparent" }}
        >
          <Controls className="!border-border !bg-background !shadow-sm" />
          <MiniMap
            className="!border-border !bg-background !shadow-sm dark:!border-zinc-700 dark:!bg-zinc-900"
            style={{
              backgroundColor: isDarkTheme ? "hsl(var(--card))" : "hsl(var(--background))",
            }}
            bgColor={isDarkTheme ? "hsl(var(--card))" : "hsl(var(--background))"}
            nodeStrokeColor={isDarkTheme ? "#f8fafc" : "#ffffff"}
            nodeStrokeWidth={isDarkTheme ? 2 : 1}
            nodeColor={(node) => minimapNodeColors[node.type ?? ""] ?? (isDarkTheme ? "#e5e7eb" : "#94a3b8")}
            maskColor={isDarkTheme ? "rgba(0, 0, 0, 0.35)" : "rgba(255, 255, 255, 0.55)"}
          />
        </ReactFlow>
        </NodeCanvasContext.Provider>

        {/* Node sidebar — slides in from right (hidden when history panel is open) */}
        {contextMenu && !isMobile && (
          <div
            data-editor-context-menu
            role="menu"
            className="fixed z-50 w-44 overflow-hidden rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
            style={{
              left: typeof window === "undefined" ? contextMenu.x : Math.min(contextMenu.x, window.innerWidth - 190),
              top: typeof window === "undefined" ? contextMenu.y : Math.min(contextMenu.y, window.innerHeight - 220),
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            {contextMenu.kind === "node" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    dispatch({ type: "SELECT_NODE", nodeId: contextMenu.nodeId });
                    setContextMenu(null);
                  }}
                >
                  Configure
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    duplicateNode(contextMenu.nodeId);
                    setContextMenu(null);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    void navigator.clipboard?.writeText(contextMenu.nodeId);
                    setValidationNotice("Node id copied.");
                    setContextMenu(null);
                  }}
                >
                  Copy node id
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    const nodeId = contextMenu.nodeId;
                    dispatch({ type: "REMOVE_NODE", nodeId });
                    skipSyncRef.current = true;
                    setRfNodes((prev) => prev.filter((node) => node.id !== nodeId));
                    setRfEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
                    setContextMenu(null);
                  }}
                >
                  Delete
                </button>
              </>
            ) : contextMenu.kind === "edge" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    insertNodeOnEdge(contextMenu.edgeId);
                    setContextMenu(null);
                  }}
                >
                  Insert step
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    const edgeId = contextMenu.edgeId;
                    dispatch({ type: "REMOVE_EDGE", edgeId });
                    skipSyncRef.current = true;
                    setRfEdges((prev) => prev.filter((edge) => edge.id !== edgeId));
                    setContextMenu(null);
                  }}
                >
                  Delete connection
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    setContextAddPosition(contextMenu.flowPosition);
                    setShowPalette(true);
                    setShowAiEdit(false);
                    setContextMenu(null);
                  }}
                >
                  Add node
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    reactFlowInstanceRef.current?.fitView({ padding: 0.15 });
                    setContextMenu(null);
                  }}
                >
                  Fit view
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    dispatch({ type: "SELECT_NODE", nodeId: null });
                    dispatch({ type: "SELECT_EDGE", edgeId: null });
                    setContextMenu(null);
                  }}
                >
                  Clear selection
                </button>
              </>
            )}
          </div>
        )}

        {state.selectedNodeId && !isMobile && !showHistory && (
          <NodeSidebar
            nodeId={state.selectedNodeId}
            schema={state.schema}
            programId={programId}
            apiKeys={apiKeys}
            connections={allConnections}
            validationResult={state.validationResult}
            nodeExecutions={nodeExecutions}
            lastRunId={lastRunId}
            onUpdate={handleSidebarUpdate}
            onClose={() => dispatch({ type: "SELECT_NODE", nodeId: null })}
            onDelete={(nodeId) => {
              dispatch({ type: "REMOVE_NODE", nodeId });
              dispatch({ type: "SELECT_NODE", nodeId: null });
            }}
          />
        )}

        {/* Step debugger panel */}
        {enableAdvancedEditor && showDebugger && (
          <DebugPanel
            schema={state.schema}
            nodeExecutions={nodeExecutions}
            lastRunId={lastRunId}
            onClose={() => setShowDebugger(false)}
            onFocusNode={(nodeId) => {
              dispatch({ type: "SELECT_NODE", nodeId });
            }}
          />
        )}

        {/* Version history panel — slides in from right */}
        {showHistory && (
          <VersionHistoryPanel
            programId={programId}
            currentVersion={state.schema.version_history.length > 0
              ? Math.max(...state.schema.version_history.map((v) => v.version_number))
              : 0}
            onRollback={(schema) => {
              dispatch({ type: "RESTORE_VERSION", schema });
              setShowHistory(false);
            }}
            onClose={() => setShowHistory(false)}
            currentSchema={state.schema}
            enableAdvancedEditor={enableAdvancedEditor}
          />
        )}

        {/* Run log drawer — slides up from the bottom when a run is active */}
        {showRunLog && lastRunId && (
          <RunLogDrawer
            runId={lastRunId}
            programId={programId}
            runStatus={currentRunStatus}
            startedAt={currentRunStartedAt}
            schemaNodes={state.schema.nodes}
            nodeExecutions={nodeExecutions}
            onClose={() => setShowRunLog(false)}
          />
        )}
      </div>

      {/* Run with payload dialog */}
      <Dialog open={showWebhookTest} onOpenChange={(open) => { if (!open) setShowWebhookTest(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Run with payload</DialogTitle>
            <DialogDescription>
              Paste a JSON payload to inject as the trigger data. Useful for debugging — e.g. provide a real <code className="text-xs bg-muted px-1 rounded">message_id</code> to test an email node without waiting for a live email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Textarea
              rows={8}
              className="font-mono text-xs resize-none"
              value={webhookPayload}
              onChange={(e) => handleWebhookPayloadChange(e.target.value)}
              placeholder={'{\n  "key": "value"\n}'}
              spellCheck={false}
            />
            <p className={cn(
              "text-[11px] font-medium",
              webhookPayloadValid ? "text-green-600 dark:text-green-400" : "text-destructive"
            )}>
              {webhookPayloadValid ? "JSON object valid" : "Enter a valid JSON object"}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWebhookTest(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTestWebhook}
              disabled={!webhookPayloadValid || isRunning}
            >
              {isRunning ? "Starting…" : "Send test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pre-flight failure dialog */}
      <Dialog open={!!preFlightChecks} onOpenChange={(open) => { if (!open) { setPreFlightChecks(null); setIsComplianceBlock(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <span>⚠</span> {isComplianceBlock ? "Compliance check blocked this run" : "Validation needs attention"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {isComplianceBlock
                ? "One or more workspace compliance policies are blocking this workflow. Resolve each issue below, then try again."
                : "Fix the following issues before running this program."}
            </p>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {(preFlightChecks ?? [])
              .filter((c) => c.status === "fail")
              .map((check) => (
                <div key={check.code} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {check.label}
                  </p>
                  {check.failures.map((f, i) => {
                    const rem = f.remediation;
                    const fallbackLink = preFlightFixLink(check.code, f.fix_suggestion);

                    return (
                      <div key={i} className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                        <p className="text-sm font-medium text-foreground">{f.message}</p>
                        {f.fix_suggestion && (
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium text-primary">How to fix: </span>
                              {f.fix_suggestion}
                            </p>

                            {/* Prefer the structured remediation over the generic fallback link */}
                            {rem?.type === "acknowledge_dpa" ? (
                              <button
                                type="button"
                                disabled={acknowledgingProvider !== null}
                                className="shrink-0 text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80 whitespace-nowrap disabled:opacity-50"
                                onClick={async () => {
                                  for (const pid of rem.provider_ids) {
                                    setAcknowledgingProvider(pid);
                                    await fetch(`/api/programs/${programId}/compliance/acknowledge-provider`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ provider_id: pid }),
                                    });
                                  }
                                  setAcknowledgingProvider(null);
                                  setPreFlightChecks(null);
                                  setIsComplianceBlock(false);
                                }}
                              >
                                {acknowledgingProvider !== null ? "Acknowledging…" : "I have a DPA — unblock →"}
                              </button>
                            ) : rem?.type === "assign_agent_defaults" ? (
                              <button
                                type="button"
                                disabled={applyingFixNodeId !== null}
                                className="shrink-0 text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80 whitespace-nowrap disabled:opacity-50"
                                onClick={async () => {
                                  setApplyingFixNodeId(rem.node_id);
                                  try {
                                    const res = await fetch(`/api/programs/${programId}/preflight/fix`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ remediation: { type: "assign_agent_defaults", node_id: rem.node_id } }),
                                    });
                                    if (res.ok) {
                                      const data = await res.json() as { validation?: { checks?: PreFlightCheck[] } };
                                      const nextChecks = data.validation?.checks ?? [];
                                      const remaining = nextChecks.filter((c) => c.status === "fail");
                                      setPreFlightChecks(remaining.length > 0 ? nextChecks : null);
                                    }
                                  } finally {
                                    setApplyingFixNodeId(null);
                                  }
                                }}
                              >
                                {applyingFixNodeId === rem.node_id ? "Fixing…" : "Auto-assign API key →"}
                              </button>
                            ) : rem?.type === "navigate" ? (
                              <a
                                href={rem.href}
                                className="shrink-0 text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80 whitespace-nowrap"
                                onClick={() => setPreFlightChecks(null)}
                              >
                                {rem.label} →
                              </a>
                            ) : fallbackLink ? (
                              <a
                                href={fallbackLink.href}
                                className="shrink-0 text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80 whitespace-nowrap"
                                onClick={() => setPreFlightChecks(null)}
                              >
                                {fallbackLink.label} →
                              </a>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreFlightChecks(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </EditorDispatchContext.Provider>
  );
}

// ─── Utility: map a pre-flight check code to an actionable link ──────────────

function preFlightFixLink(
  code: string,
  fixSuggestion: string
): { href: string; label: string } | null {
  if (code === "PRE_001" || code === "PRE_003" || fixSuggestion.toLowerCase().includes("connection")) {
    return { href: "/connections", label: "Go to Connections" };
  }
  if (code === "PRE_002" || fixSuggestion.toLowerCase().includes("api key")) {
    return { href: "/api-keys", label: "Go to API Keys" };
  }
  // Compliance checks — route by fix suggestion text (all use PRE_COMPLY code)
  if (fixSuggestion.toLowerCase().includes("governance")) {
    return { href: "/governance", label: "Open Governance" };
  }
  if (fixSuggestion.toLowerCase().includes("subprocessors") || fixSuggestion.toLowerCase().includes("dpa") || fixSuggestion.toLowerCase().includes("registry")) {
    return { href: "/subprocessors", label: "View provider registry" };
  }
  if (fixSuggestion.toLowerCase().includes("settings")) {
    return { href: "/settings", label: "Open Settings" };
  }
  return null;
}

// ─── Utility: human-readable fix suggestion per compliance check ID ───────────

// Build the acknowledge_dpa remediation for DPA/model-policy compliance blocks.
function complianceRemediation(
  checkId: string,
  details?: Record<string, unknown>
): import("@/lib/validation/pre-flight").PreFlightRemediation | undefined {
  if (checkId !== "dpa-subprocessors" && checkId !== "model-provider-policy") return undefined;
  const ids = Array.isArray(details?.provider_names)
    ? (details.provider_names as string[]).filter(Boolean)
    : [];
  if (ids.length === 0) return undefined;
  return { type: "acknowledge_dpa", label: "Acknowledge DPA", provider_ids: ids };
}

function complianceFixSuggestion(checkId: string, status: string, details?: Record<string, unknown>): string {
  const names = Array.isArray(details?.provider_names) && (details.provider_names as string[]).length > 0
    ? (details.provider_names as string[]).join(", ")
    : null;
  switch (checkId) {
    case "model-provider-policy":
      return names
        ? `${names} ${(details!.provider_names as string[]).length === 1 ? "is" : "are"} not yet fully reviewed in the Corelyx provider registry (DPA, SCC, or training-policy entry missing). You can continue anyway if you have verified your own DPA with this provider, or switch to a reviewed provider such as Anthropic or OpenAI via the node settings.`
        : "One or more AI model providers used in this workflow are not yet fully reviewed. Switch to a reviewed provider or contact support.";
    case "dpa-subprocessors":
      return names
        ? `${names} ${(details!.provider_names as string[]).length === 1 ? "does" : "do"} not have a completed DPA entry in the Corelyx registry. If you have your own DPA with this provider, contact support to have it added. Alternatively, remove or replace the connector using this provider.`
        : "A connector in this workflow uses a provider without a completed DPA entry. Remove the connector or contact support.";
    case "eu-only-mode":
      return "EU-only mode is active and this workflow uses a provider that hasn't been cleared for EU residency. Either remove the provider or switch the workspace to standard mode in Settings → Compliance.";
    case "ai-act-risk":
      return status === "needs_reviewer"
        ? "This workflow is classified as high-risk under the EU AI Act and needs explicit reviewer approval. Open Governance, assign a reviewer, and mark this workflow as approved before running."
        : "This workflow is flagged as potentially prohibited under the EU AI Act. Do not run without legal review. Contact your legal team.";
    case "human-approval":
      return "This workflow triggers high-impact actions but has no Human Approval gate. Add a Human Approval node before the high-impact step in the editor, then try running again.";
    case "logging-retention":
      return "Execution log retention is not configured for this high-risk workflow. Open Settings → Compliance and set a non-zero retention period.";
    case "gdpr-transfer-risk":
      return "A provider in this workflow may transfer data outside the EEA. Review the data flow in Governance and confirm the transfer basis is documented.";
    default:
      return "Open Governance to review and resolve this compliance issue before running the workflow.";
  }
}

// ─── Utility: detect if a form input is currently focused ────────────────────

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (el as HTMLElement).isContentEditable
  );
}
