import { ProgramDraftSchemaZ } from "@flowos/schema";
import type { ProgramSchema, Node as SchemaNode, TriggerConfig, StepConfig, RunStatus } from "@flowos/schema";
import { z } from "zod";

type MutableRecord = Record<string, unknown>;
type FilterStepConfig = Extract<StepConfig, { logic_type: "filter" }>;
type BranchStepConfig = Extract<StepConfig, { logic_type: "branch" }>;
type TransformStepConfig = Extract<StepConfig, { logic_type: "transform" }>;

const VALID_NODE_TYPES = new Set(["trigger", "agent", "agent_task", "step", "connection", "note", "group"]);
const VALID_EDGE_TYPES = new Set(["data_flow", "control_flow", "event_subscription"]);
const VALID_TRIGGER_TYPES = new Set(["cron", "event", "webhook", "manual", "program_output", "file_watch"]);
const STEP_TYPE_ALIASES = new Set(["transform", "filter", "branch", "delay", "loop", "format", "parse", "deduplicate", "sort"]);

const NODE_TYPE_ALIASES: Record<string, SchemaNode["type"]> = {
  action: "connection",
  api: "connection",
  connector: "connection",
  cron: "trigger",
  decision: "step",
  filter_node: "step",
  integration: "connection",
  llm: "agent",
  mapper: "step",
  model: "agent",
  schedule: "trigger",
  service: "connection",
  branch: "step",
  delay: "step",
  task: "step",
  filter: "step",
  format: "step",
  loop: "step",
  parse: "step",
  sort: "step",
  transform: "step",
  transform_node: "step",
  webhook: "trigger",
};

const TRIGGER_ALIASES: Record<string, TriggerConfig["trigger_type"]> = {
  cron_job: "cron",
  cronjob: "cron",
  http: "webhook",
  http_webhook: "webhook",
  incoming_webhook: "webhook",
  interval: "cron",
  schedule: "cron",
  scheduled: "cron",
  timer: "cron",
};

const DEFAULT_RETRY = {
  max_attempts: 3,
  backoff: "exponential" as const,
  backoff_base_seconds: 5,
  fail_program_on_exhaust: false,
};

const DEFAULT_METADATA = {
  description: "",
  genesis_model: "manual",
  genesis_timestamp: "",
  tags: [] as string[],
  is_active: false,
  last_run_id: null,
  last_run_status: null,
  last_run_timestamp: null,
};

function isRecord(value: unknown): value is MutableRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function maybeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function makeId(prefix: string, used: Set<string>): string {
  let id = "";
  do {
    id = `${prefix}_${crypto.randomUUID()}`;
  } while (used.has(id));
  used.add(id);
  return id;
}

function normalizeNodeType(type: unknown, config: MutableRecord): SchemaNode["type"] {
  if (typeof type === "string") {
    const lower = type.toLowerCase();
    if (VALID_NODE_TYPES.has(lower)) return lower as SchemaNode["type"];
    if (NODE_TYPE_ALIASES[lower]) return NODE_TYPE_ALIASES[lower];
  }
  if ("trigger_type" in config) return "trigger";
  if ("logic_type" in config) return "step";
  if ("model" in config || "system_prompt" in config) return "agent";
  return "connection";
}

function normalizePosition(value: unknown, index: number): { x: number; y: number } {
  if (isRecord(value)) {
    return {
      x: numberValue(value.x, 100 + index * 320),
      y: numberValue(value.y, 200),
    };
  }
  return { x: 100 + index * 320, y: 200 };
}

function normalizeTriggerConfig(config: MutableRecord): TriggerConfig {
  const rawType = typeof config.trigger_type === "string" ? config.trigger_type.toLowerCase() : "";
  const triggerType = (TRIGGER_ALIASES[rawType] ?? rawType) as TriggerConfig["trigger_type"];

  if (triggerType === "cron") {
    return {
      trigger_type: "cron",
      expression: stringValue(config.expression ?? config.cron ?? config.schedule, "0 8 * * *"),
      timezone: stringValue(config.timezone, "UTC"),
    };
  }
  if (triggerType === "webhook") {
    return {
      trigger_type: "webhook",
      endpoint_id: stringValue(config.endpoint_id, crypto.randomUUID()),
      method: config.method === "GET" ? "GET" : "POST",
    };
  }
  if (triggerType === "event") {
    return {
      trigger_type: "event",
      source: stringValue(config.source, "unknown"),
      event: stringValue(config.event, "trigger"),
      filter: isRecord(config.filter) ? config.filter : null,
    };
  }
  if (triggerType === "program_output") {
    return {
      trigger_type: "program_output",
      source_program_id: stringValue(config.source_program_id, "__USER_ASSIGNED__"),
      on_status: Array.isArray(config.on_status) ? config.on_status as RunStatus[] : ["success"],
    };
  }
  if (triggerType === "file_watch") {
    const validEvents = ["created", "modified", "deleted"] as const;
    const events = Array.isArray(config.events)
      ? config.events.filter((e): e is (typeof validEvents)[number] =>
          typeof e === "string" && (validEvents as readonly string[]).includes(e))
      : [];
    return {
      trigger_type: "file_watch",
      device_id: stringValue(config.device_id, "").trim() ? stringValue(config.device_id, "") : null,
      path: stringValue(config.path, ""),
      events: events.length > 0 ? events : [...validEvents],
      patterns: Array.isArray(config.patterns)
        ? config.patterns.filter((p): p is string => typeof p === "string")
        : [],
    };
  }
  return { trigger_type: "manual" };
}

function normalizeStepConfig(config: MutableRecord): StepConfig {
  const logicType = typeof config.logic_type === "string" ? config.logic_type : "transform";
  if (logicType === "filter") {
    return {
      logic_type: "filter",
      condition: typeof config.condition === "string" ? config.condition : "",
      pass_schema: isRecord(config.pass_schema) ? config.pass_schema as unknown as FilterStepConfig["pass_schema"] : null,
    };
  }
  if (logicType === "branch") {
    return {
      logic_type: "branch",
      conditions: Array.isArray(config.conditions) ? config.conditions as BranchStepConfig["conditions"] : [],
      default_branch: typeof config.default_branch === "string" ? config.default_branch : "",
    };
  }
  if (logicType === "delay") {
    return { logic_type: "delay", seconds: numberValue(config.seconds, 5) };
  }
  if (logicType === "loop") {
    return {
      logic_type: "loop",
      over: typeof config.over === "string" ? config.over : "",
      item_var: typeof config.item_var === "string" ? config.item_var : "item",
    };
  }
  if (logicType === "format") {
    return {
      logic_type: "format",
      template: typeof config.template === "string" ? config.template : "",
      output_key: typeof config.output_key === "string" ? config.output_key : "text",
    };
  }
  if (logicType === "parse") {
    const format = config.format === "csv" || config.format === "lines" ? config.format : "json";
    return {
      logic_type: "parse",
      input_key: typeof config.input_key === "string" ? config.input_key : "text",
      format,
    };
  }
  if (logicType === "deduplicate") {
    return { logic_type: "deduplicate", key: typeof config.key === "string" ? config.key : "id" };
  }
  if (logicType === "sort") {
    return {
      logic_type: "sort",
      key: typeof config.key === "string" ? config.key : "id",
      order: config.order === "desc" ? "desc" : "asc",
    };
  }
  return {
    logic_type: "transform",
    transformation: typeof config.transformation === "string" ? config.transformation : "",
    input_schema: isRecord(config.input_schema) ? config.input_schema as unknown as TransformStepConfig["input_schema"] : null,
    output_schema: isRecord(config.output_schema) ? config.output_schema as unknown as TransformStepConfig["output_schema"] : null,
  };
}

function normalizeConfig(type: SchemaNode["type"], config: MutableRecord): SchemaNode["config"] {
  if (type === "trigger") return normalizeTriggerConfig(config);
  if (type === "step") return normalizeStepConfig(config);
  if (type === "note") {
    return {
      content: typeof config.content === "string" ? config.content : "",
      color: (["yellow", "blue", "pink", "green"] as const).includes(config.color as never)
        ? (config.color as "yellow" | "blue" | "pink" | "green")
        : "yellow",
    };
  }
  if (type === "group") {
    return {
      childIds: Array.isArray(config.childIds)
        ? config.childIds.filter((id): id is string => typeof id === "string")
        : [],
      width: numberValue(config.width, 400),
      height: numberValue(config.height, 300),
    };
  }
  if (type === "agent") {
    return {
      model: stringValue(config.model, "__USER_ASSIGNED__"),
      api_key_ref: stringValue(config.api_key_ref, "__USER_ASSIGNED__"),
      system_prompt: typeof config.system_prompt === "string" ? config.system_prompt : "",
      input_schema: isRecord(config.input_schema) ? config.input_schema as never : null,
      output_schema: isRecord(config.output_schema) ? config.output_schema as never : null,
      requires_approval: booleanValue(config.requires_approval, false),
      approval_timeout_hours: numberValue(config.approval_timeout_hours, 24),
      scope_required: maybeString(config.scope_required),
      scope_access: config.scope_access === "write" || config.scope_access === "read_write" ? config.scope_access : "read",
      retry: isRecord(config.retry) ? { ...DEFAULT_RETRY, ...config.retry } as never : DEFAULT_RETRY,
      tools: Array.isArray(config.tools) ? config.tools.filter((tool): tool is string => typeof tool === "string") : [],
    };
  }

  if (type === "agent_task") {
    return {
      objective: typeof config.objective === "string" ? config.objective : "",
      model: stringValue(config.model, "__USER_ASSIGNED__"),
      api_key_ref: stringValue(config.api_key_ref, "__USER_ASSIGNED__"),
      max_iterations: numberValue(config.max_iterations, 8),
      tools: Array.isArray(config.tools) ? config.tools.filter((tool): tool is string => typeof tool === "string") : [],
      scope_access: config.scope_access === "write" || config.scope_access === "read_write" ? config.scope_access : "read",
      requires_approval: booleanValue(config.requires_approval, false),
      approval_timeout_hours: numberValue(config.approval_timeout_hours, 24),
      input_schema: isRecord(config.input_schema) ? config.input_schema as never : null,
      output_schema: isRecord(config.output_schema) ? config.output_schema as never : null,
      retry: isRecord(config.retry) ? { ...DEFAULT_RETRY, ...config.retry } as never : DEFAULT_RETRY,
    } as never;
  }

  if (config.connector_type === "http") {
    return {
      connector_type: "http",
      method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(String(config.method))
        ? config.method as never
        : "GET",
      url: typeof config.url === "string" ? config.url : "",
      auth_type: ["none", "bearer", "basic", "api_key_header", "api_key_query"].includes(String(config.auth_type))
        ? config.auth_type as never
        : "none",
      auth_value: typeof config.auth_value === "string" ? config.auth_value : null,
      query_params: Array.isArray(config.query_params) ? config.query_params as never : [],
      headers: Array.isArray(config.headers) ? config.headers as never : [],
      body: typeof config.body === "string" ? config.body : null,
      parse_response: booleanValue(config.parse_response, true),
      timeout_seconds: typeof config.timeout_seconds === "number" ? config.timeout_seconds : null,
      retry: isRecord(config.retry) ? { ...DEFAULT_RETRY, ...config.retry } as never : null,
    };
  }

  return {
    provider: maybeString(config.provider) ?? undefined,
    scope_access: config.scope_access === "write" || config.scope_access === "read_write" ? config.scope_access : "read",
    scope_required: Array.isArray(config.scope_required)
      ? config.scope_required.filter((scope): scope is string => typeof scope === "string")
      : typeof config.scope_required === "string"
        ? [config.scope_required]
        : [],
    operation: maybeString(config.operation) ?? undefined,
    operation_params: isRecord(config.operation_params) ? config.operation_params : undefined,
  };
}

export function normalizeProgramDraft(raw: unknown, fallback?: Partial<ProgramSchema>): ProgramSchema {
  const source = isRecord(raw) ? raw : {};
  const now = new Date().toISOString();
  const usedNodeIds = new Set<string>();

  const nodes = (Array.isArray(source.nodes) ? source.nodes : []).map((node, index) => {
    const n = isRecord(node) ? node : {};
    const rawConfig = isRecord(n.config) ? n.config : {};
    const type = normalizeNodeType(n.type, rawConfig);
    if (type === "step" && !("logic_type" in rawConfig) && typeof n.type === "string") {
      const lowerType = n.type.toLowerCase();
      if (STEP_TYPE_ALIASES.has(lowerType)) rawConfig.logic_type = lowerType;
    }
    const id = stringValue(n.id, makeId(type, usedNodeIds));
    if (usedNodeIds.has(id)) {
      n.id = makeId(type, usedNodeIds);
    } else {
      usedNodeIds.add(id);
    }
    const finalId = stringValue(n.id, id);

    return {
      id: finalId,
      type,
      label: stringValue(n.label, type === "trigger" ? "Manual Trigger" : type === "step" ? "Workflow Step" : type === "agent" ? "AI Agent" : type === "agent_task" ? "Agent Task" : type === "note" ? "Note" : type === "group" ? "Group" : "Connection"),
      description: typeof n.description === "string" ? n.description : "",
      position: normalizePosition(n.position, index),
      status: stringValue(n.status, "idle"),
      // "corelyx"/"corelyx:*" is never a real connection — the corelyx.* tools
      // are internal agent_task capabilities the model occasionally miswires as
      // a connection ref, which then fails at runtime with CONNECTION_NOT_FOUND.
      connection:
        type === "step" || type === "trigger" || type === "note" || type === "group"
          ? null
          : typeof n.connection === "string" && !/^corelyx(:|$)/i.test(n.connection.trim())
            ? n.connection
            : null,
      config: normalizeConfig(type, rawConfig),
    } as SchemaNode;
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(source.edges) ? source.edges : []).map((edge, index) => {
    const e = isRecord(edge) ? edge : {};
    const from = stringValue(e.from ?? e.source, "");
    const to = stringValue(e.to ?? e.target, "");
    const edgeType = typeof e.type === "string" && VALID_EDGE_TYPES.has(e.type) ? e.type : "data_flow";
    return {
      id: stringValue(e.id, `e${index + 1}`),
      from,
      to,
      type: edgeType,
      data_mapping: isRecord(e.data_mapping) ? e.data_mapping as Record<string, string> : null,
      condition: typeof e.condition === "string" ? e.condition : null,
      label: typeof e.label === "string" ? e.label : null,
    };
  });

  const triggers = nodes
    .filter((node) => node.type === "trigger")
    .map((node) => {
      const config = node.config as TriggerConfig;
      const type = VALID_TRIGGER_TYPES.has(config.trigger_type) ? config.trigger_type : "manual";
      const existing = Array.isArray(source.triggers)
        ? source.triggers.find((trigger) => isRecord(trigger) && trigger.node_id === node.id) as MutableRecord | undefined
        : undefined;
      return {
        node_id: node.id,
        type,
        is_active: booleanValue(existing?.is_active, true),
        last_fired: typeof existing?.last_fired === "string" ? existing.last_fired : null,
        next_scheduled: typeof existing?.next_scheduled === "string" ? existing.next_scheduled : null,
      };
    });

  const metadata = isRecord(source.metadata) ? source.metadata : {};
  const programName = stringValue(source.program_name ?? source.name ?? fallback?.program_name, "Untitled program");
  // Preserve program_type. Dropping it defaulted every draft to "workflow",
  // which makes ProgramDraftSchemaZ reject agent_task nodes (only valid in
  // agents) — breaking one-time agent generation.
  const programType =
    source.program_type === "agent" || source.program_type === "workflow"
      ? source.program_type
      : fallback?.program_type;
  const normalized = {
    version: "1.0",
    program_id: stringValue(source.program_id ?? fallback?.program_id, crypto.randomUUID()),
    program_name: programName,
    ...(programType ? { program_type: programType } : {}),
    created_at: stringValue(source.created_at ?? fallback?.created_at, now),
    updated_at: now,
    execution_mode: source.execution_mode === "autonomous" || source.execution_mode === "approval_required" || source.execution_mode === "supervised"
      ? source.execution_mode
      : fallback?.execution_mode ?? "supervised",
    nodes,
    edges,
    triggers,
    version_history: Array.isArray(source.version_history) ? source.version_history : fallback?.version_history ?? [],
    metadata: {
      ...DEFAULT_METADATA,
      ...metadata,
      description: typeof metadata.description === "string" ? metadata.description : fallback?.metadata?.description ?? "",
      genesis_timestamp: typeof metadata.genesis_timestamp === "string" && metadata.genesis_timestamp ? metadata.genesis_timestamp : fallback?.metadata?.genesis_timestamp ?? now,
      tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag): tag is string => typeof tag === "string") : [],
    },
  };

  // Keep edge reference mistakes intact so ProgramDraftSchemaZ can produce an
  // actionable error instead of silently deleting user or AI output.
  void nodeIds;
  return normalized as ProgramSchema;
}

export function validateProgramDraft(schema: unknown) {
  return ProgramDraftSchemaZ.safeParse(schema);
}

/**
 * Drop edges that reference a node id that does not exist in the graph, and
 * trigger-index entries whose trigger node is gone.
 *
 * Intended for the *generation* flow (Genesis), where the model occasionally
 * emits an edge to a node it renamed or never produced — a single such edge
 * otherwise fails the whole draft (`ProgramDraftSchemaZ` rejects dangling
 * references) and the user is told to "rephrase" a plan that was 95% valid.
 * Since the user reviews and approves the generated plan before it runs,
 * pruning a stray edge degrades far more gracefully than a hard failure.
 *
 * NOT applied inside `normalizeProgramDraft`: the import/editor path
 * deliberately keeps dangling references so validation can surface an
 * actionable error rather than silently deleting user-authored edges.
 *
 * Returns the same object reference with `edges`/`triggers` filtered, plus a
 * count of what was removed (for logging).
 */
export function pruneUnresolvedReferences<T extends ProgramSchema>(
  schema: T
): { schema: T; removedEdges: number; removedTriggers: number } {
  const nodeIds = new Set(schema.nodes.map((node) => node.id));
  const triggerNodeIds = new Set(
    schema.nodes.filter((node) => node.type === "trigger").map((node) => node.id)
  );

  const keptEdges = schema.edges.filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)
  );
  const keptTriggers = schema.triggers.filter((trigger) =>
    triggerNodeIds.has(trigger.node_id)
  );

  const removedEdges = schema.edges.length - keptEdges.length;
  const removedTriggers = schema.triggers.length - keptTriggers.length;

  schema.edges = keptEdges;
  schema.triggers = keptTriggers;
  return { schema, removedEdges, removedTriggers };
}

export function getDraftValidationMessage(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Workflow draft is not structurally valid.";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}
