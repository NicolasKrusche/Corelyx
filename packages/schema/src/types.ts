// ─── ROOT ─────────────────────────────────────────────────────────────────

export interface ProgramSchema {
  version: "1.0";
  program_id: string;
  program_name: string;
  // Discriminates a repeating workflow from a one-time agent. Absent on legacy
  // schemas, which are always workflows — the validator defaults it accordingly.
  program_type?: ProgramType;
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
  execution_mode: ExecutionMode;
  nodes: Node[];
  edges: Edge[];
  triggers: Trigger[];
  version_history: VersionSnapshot[];
  metadata: ProgramMetadata;
}

/**
 * "workflow" — the classic repeating automation (triggers, runs many times).
 * "agent"    — a one-time, plan-then-run task. Same underlying graph engine,
 *              but no triggers, runs once, and is discarded after success unless
 *              the user saves it as a reusable template. Presented as a distinct
 *              product surface so it is not mistaken for a free workflow.
 */
export type ProgramType = "workflow" | "agent";

export type ExecutionMode = "autonomous" | "approval_required" | "supervised";

// ─── METADATA ─────────────────────────────────────────────────────────────

export interface ProgramMetadata {
  description: string;
  genesis_model: string;
  genesis_timestamp: string;   // ISO 8601
  tags: string[];
  is_active: boolean;
  last_run_id: string | null;
  last_run_status: RunStatus | null;
  last_run_timestamp: string | null;
  ai_use_case_category?: string | null;
  ai_act_risk_level?:
    | "prohibited"
    | "high_risk"
    | "transparency"
    | "gpai_related"
    | "limited_or_minimal"
    | "unknown";
  customer_role?:
    | "provider"
    | "deployer"
    | "distributor"
    | "importer"
    | "product_manufacturer"
    | "unknown";
  human_oversight_required?: boolean;
  transparency_notice_required?: boolean;
  high_risk_documentation_required?: boolean;
  prohibited_reason?: string | null;
  reviewer?: string | null;
  reviewed_at?: string | null;
  ai_act_notes?: string | null;
  legal_review_override?: boolean;
}

export type RunStatus = "success" | "failed" | "partial" | "running" | "waiting_approval";

// ─── NODES ────────────────────────────────────────────────────────────────

export type Node =
  | TriggerNode
  | AgentNode
  | AgentTaskNode
  | StepNode
  | ConnectionNode
  | NoteNode
  | GroupNode;

export interface NodeBase {
  id: string;
  label: string;
  description: string;
  position: { x: number; y: number };
  status: NodeStatus;
  metadata?: NodeMetadata;
}

/**
 * AI-generated explainability metadata attached to each node during Genesis
 * generation. Stores why the AI chose this node, what alternatives were
 * considered, and a confidence score. Supports AI Act Art. 14/50 compliance
 * (transparency obligation for AI systems).
 */
export interface NodeMetadata {
  genesis_reasoning?: {
    /** Why this specific node was chosen for this position in the workflow */
    reasoning: string;
    /** Alternative nodes/connectors considered but not selected */
    alternatives: string[];
    /** Confidence score 0-1 indicating how certain the AI was about this choice */
    confidence: number;
  };
  /** Timestamp when this metadata was generated */
  generated_at?: string;
}

export type NodeStatus =
  | "idle"
  | "running"
  | "success"
  | "failed"
  | "waiting_approval"
  | "skipped";

// TRIGGER NODE

export interface TriggerNode extends NodeBase {
  type: "trigger";
  connection: string | null;
  config: TriggerConfig;
}

export type TriggerConfig =
  | { trigger_type: "cron"; expression: string; timezone: string }
  | { trigger_type: "event"; source: string; event: string; filter: object | null }
  | { trigger_type: "webhook"; endpoint_id: string; method: "POST" | "GET" }
  | { trigger_type: "manual" }
  | { trigger_type: "program_output"; source_program_id: string; on_status: RunStatus[] }
  | {
      // Fires when a file changes inside a granted folder on a paired desktop
      // device. The Bridge watches `path` locally and pushes change events to the
      // cloud, which fires the workflow/agent. `device_id` null = the workspace's
      // default (most-recently-seen) device. `patterns` are glob filters on the
      // file name (empty = any file). `events` selects which change kinds fire.
      trigger_type: "file_watch";
      device_id: string | null;
      path: string;
      events: FileWatchEvent[];
      patterns: string[];
    };

export type FileWatchEvent = "created" | "modified" | "deleted";

// AGENT NODE

export interface AgentNode extends NodeBase {
  type: "agent";
  connection: string | null;
  config: AgentConfig;
}

export interface AgentConfig {
  model: string | "__USER_ASSIGNED__";
  api_key_ref: string | "__USER_ASSIGNED__";
  system_prompt: string;
  input_schema: DataSchema | null;
  output_schema: DataSchema | null;
  requires_approval: boolean;
  approval_timeout_hours: number;
  // Governance metadata recorded on the approval request: a named
  // approver/role and a plain-language reason shown to the approver.
  approval_approver?: string;
  approval_reason?: string;
  scope_required: string | null;
  scope_access: "read" | "write" | "read_write";
  retry: RetryConfig;
  tools: string[];
}

// AGENT TASK NODE — a bounded autonomous tool-loop. The hybrid execution model:
// the surrounding graph is a fixed, user-approved plan, but this single node may
// reason and call allow-listed tools over several turns to accomplish its
// objective. Only valid inside agent programs (program_type === "agent"); it is
// never offered in the workflow editor palette, so workflows can't smuggle in
// autonomous behavior.

export interface AgentTaskNode extends NodeBase {
  type: "agent_task";
  connection: string | null;
  config: AgentTaskConfig;
}

export interface AgentTaskConfig {
  // Plain-language objective for this task step.
  objective: string;
  model: string | "__USER_ASSIGNED__";
  api_key_ref: string | "__USER_ASSIGNED__";
  // Hard ceiling on LLM↔tool turns so a loop can never run unbounded.
  max_iterations: number; // 1–25
  // Allow-listed tool ids the loop may call (account-introspection +
  // connector operations). Empty = reasoning only, no side effects.
  tools: string[];
  // Highest side-effect level the loop is permitted to perform.
  scope_access: "read" | "write" | "read_write";
  // Pause for human approval before any write / side-effecting tool runs.
  requires_approval: boolean;
  approval_timeout_hours: number;
  // Governance metadata recorded on the approval request (optional).
  approval_approver?: string;
  approval_reason?: string;
  input_schema: DataSchema | null;
  output_schema: DataSchema | null;
  retry: RetryConfig;
}

// STEP NODE

export interface StepNode extends NodeBase {
  type: "step";
  connection: null;
  config: StepConfig;
}

/**
 * Fields shared by every step regardless of logic_type.
 *
 * Steps have always been retried — create_retry_policy_for_node falls back to
 * 3 attempts with exponential backoff — but until this field existed there was
 * no way to tune that, switch it off for a step where retrying is wrong (a
 * delay, a non-idempotent write), or ask for a step failure to abort the run
 * instead of continuing failed-open. Omitted or null keeps the defaults.
 */
export interface StepConfigCommon {
  retry?: RetryConfig | null;
}

export type StepConfig = StepConfigCommon &
  (
    | { logic_type: "transform"; transformation: string; input_schema: DataSchema | null; output_schema: DataSchema | null }
    | { logic_type: "filter"; condition: string; pass_schema: DataSchema | null }
    | { logic_type: "branch"; conditions: BranchCondition[]; default_branch: string }
    | { logic_type: "delay"; seconds: number }
    | { logic_type: "loop"; over: string; item_var: string }
    | { logic_type: "format"; template: string; output_key: string }
    | { logic_type: "parse"; input_key: string; format: "json" | "csv" | "lines" }
    | { logic_type: "deduplicate"; key: string }
    | { logic_type: "sort"; key: string; order: "asc" | "desc" }
  );

export interface BranchCondition {
  condition: string;
  target_node_id: string;
}

// CONNECTION NODE

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface OAuthConnectionConfig {
  // Optional for backward compatibility with existing schemas that
  // predate connector_type.
  connector_type?: "oauth";
  // Provider slug (e.g. "gmail", "slack"). Set when a node is created from the
  // palette so the sidebar knows which operations to show before a connection
  // is selected, and to filter the connection dropdown to matching accounts.
  provider?: string;
  scope_access: "read" | "write" | "read_write";
  scope_required: string[];
  // Native connector operation to execute (e.g. "send_email", "read_range").
  // If omitted the node just surfaces the access token to downstream nodes.
  operation?: string;
  operation_params?: Record<string, unknown>;
}

export type HttpAuthType =
  | "none"
  | "bearer"
  | "basic"
  | "api_key_header"
  | "api_key_query";

export interface HttpConnectionConfig {
  connector_type: "http";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  url: string;
  auth_type: HttpAuthType;
  // Token / key / or "username:password" for basic auth.
  auth_value: string | null;
  query_params: KeyValuePair[];
  headers: KeyValuePair[];
  body: string | null;
  parse_response: boolean;
  timeout_seconds: number | null;
  retry: RetryConfig | null;
}

// FILE CONNECTOR — local file operations executed by the desktop Bridge.
//
// Unlike OAuth/HTTP connectors (which call a cloud API), a file node targets a
// paired device on the user's machine. The runtime enqueues the operation and
// suspends; the Bridge executes it inside its granted folders and returns a
// result. Kept type-distinct from OAuth so file access is never mistaken for a
// network call and so the security model (folder grants, sandbox) is explicit.
export type FileOperation =
  | "read"
  | "write"
  | "append"
  | "list"
  | "stat"
  | "move"
  | "copy"
  | "delete"
  | "mkdir"
  | "search";

export interface FileConnectionConfig {
  connector_type: "file";
  // Which paired device to run this on. null = the workspace's default active
  // device (resolved at enqueue time when the user has exactly one).
  device_id: string | null;
  operation: FileOperation;
  // Operation arguments (path, dest, content, pattern, ...). String values may
  // contain {{expressions}} resolved against upstream node output.
  operation_params: Record<string, unknown>;
  // Highest side-effect level this node may perform. Drives the destructive-op
  // confirmation gate, mirroring the connector scope model.
  scope_access: "read" | "write" | "read_write";
}

export type ConnectionConfig =
  | OAuthConnectionConfig
  | HttpConnectionConfig
  | FileConnectionConfig;

export interface ConnectionNode extends NodeBase {
  type: "connection";
  // OAuth connectors point to a named connected app; HTTP connectors can be null.
  connection: string | null;
  config: ConnectionConfig;
}

// NOTE NODE — purely visual, never executed

export interface NoteNode extends NodeBase {
  type: "note";
  connection: null;
  config: NoteConfig;
}

export interface NoteConfig {
  content: string;
  color: "yellow" | "blue" | "pink" | "green";
  /** Persisted so the note reopens at its last resized dimensions. */
  width?: number;
  height?: number;
}

// GROUP NODE — frame container, never executed

export interface GroupNode extends NodeBase {
  type: "group";
  connection: null;
  config: GroupConfig;
}

export interface GroupConfig {
  childIds: string[];
  width: number;
  height: number;
  color?: "zinc" | "blue" | "green" | "amber" | "pink";
}

// ─── EDGES ────────────────────────────────────────────────────────────────

export interface Edge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  data_mapping: DataMapping | null;
  condition: string | null;
  label: string | null;
}

export type EdgeType = "data_flow" | "control_flow" | "event_subscription";

export interface DataMapping {
  [sourceField: string]: string;
}

// ─── SHARED TYPES ─────────────────────────────────────────────────────────

export interface DataSchema {
  type: "object" | "string" | "number" | "boolean" | "array";
  properties?: { [key: string]: DataSchema };
  items?: DataSchema;
  required?: string[];
}

export interface RetryConfig {
  max_attempts: number;        // 1–5
  backoff: "none" | "linear" | "exponential";
  backoff_base_seconds: number; // 0–60 (runtime rejects anything higher)
  fail_program_on_exhaust: boolean;
}

// ─── TRIGGERS ─────────────────────────────────────────────────────────────

export interface Trigger {
  node_id: string;
  type: TriggerConfig["trigger_type"];
  is_active: boolean;
  last_fired: string | null;
  next_scheduled: string | null;
}

// ─── VERSION HISTORY ──────────────────────────────────────────────────────

export interface VersionSnapshot {
  version_number: number;
  timestamp: string;           // ISO 8601
  changed_by: "genesis" | "user" | "system";
  change_summary: string;
  snapshot: {
    nodes: Node[];
    edges: Edge[];
    triggers: Trigger[];
  };
}
