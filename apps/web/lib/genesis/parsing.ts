// ─── JSON extraction ──────────────────────────────────────────────────────
// Models sometimes wrap the JSON in markdown code fences, prepend explanation
// text, or append trailing commentary. This function finds the first complete
// JSON object in the response regardless of surrounding noise.

export function extractJson(raw: string): string {
  const text = raw.trim();

  const fenceStripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const completeObject = findCompleteJsonObject(fenceStripped);
  if (completeObject) return completeObject;

  return fenceStripped;
}

function findCompleteJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

// ─── Schema normalization ──────────────────────────────────────────────────
// Fixes known deviations that non-Anthropic models commonly produce, so that
// the strict Zod validator doesn't reject otherwise-valid schemas.

const TRIGGER_TYPE_MAP: Record<string, string> = {
  schedule: "cron",
  scheduled: "cron",
  cron_job: "cron",
  cronjob: "cron",
  timer: "cron",
  time: "cron",
  interval: "cron",
  http: "webhook",
  http_webhook: "webhook",
  incoming_webhook: "webhook",
};

const DATA_TYPE_MAP: Record<string, string> = {
  integer: "number",
  int: "number",
  float: "number",
  double: "number",
  long: "number",
  decimal: "number",
  dict: "object",
  list: "array",
};

function normalizeDataSchema(schema: unknown): void {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const s = schema as Record<string, unknown>;
  if (typeof s.type === "string" && DATA_TYPE_MAP[s.type]) {
    s.type = DATA_TYPE_MAP[s.type];
  }
  if (s.properties && typeof s.properties === "object") {
    for (const v of Object.values(s.properties)) normalizeDataSchema(v);
  }
  if (s.items) normalizeDataSchema(s.items);
}

// Includes agent_task/note/group so normalization never coerces them — notably
// agent_task carries scope_access, which would otherwise be mis-inferred as a
// connection node (an OAuth node with no connection reference).
const VALID_NODE_TYPES = new Set(["trigger", "agent", "agent_task", "step", "connection", "note", "group"]);

const NODE_TYPE_MAP: Record<string, string> = {
  action: "connection",
  connector: "connection",
  integration: "connection",
  api: "connection",
  service: "connection",
  decision: "step",
  condition: "step",
  filter_node: "step",
  loop: "step",
  transform_node: "step",
  branch_node: "step",
  schedule: "trigger",
  scheduled: "trigger",
  cron: "trigger",
  timer: "trigger",
  webhook: "trigger",
  llm: "agent",
  ai: "agent",
  model: "agent",
  assistant: "agent",
  task: "step",
  router: "step",
  switcher: "step",
  mapper: "step",
};

function inferNodeType(config: Record<string, unknown>): string | null {
  if ("trigger_type" in config) return "trigger";
  if ("logic_type" in config) return "step";
  if ("model" in config && "system_prompt" in config) return "agent";
  if ("scope_access" in config || "connector_type" in config) return "connection";
  return null;
}

export function normalizeSchema(raw: unknown): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const schema = raw as Record<string, unknown>;

  if (Array.isArray(schema.nodes)) {
    for (const node of schema.nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as Record<string, unknown>;

      if (typeof n.type === "string" && !VALID_NODE_TYPES.has(n.type)) {
        const mapped = NODE_TYPE_MAP[n.type.toLowerCase()];
        if (mapped) {
          n.type = mapped;
        } else if (n.config && typeof n.config === "object") {
          const inferred = inferNodeType(n.config as Record<string, unknown>);
          if (inferred) n.type = inferred;
        }
      }

      // The internal "corelyx" agent toolset (report_to_user, list_runs, …) is
      // NOT a connectable OAuth provider. Planners sometimes model the "report
      // back to the user" step as a connection node pointing at a bogus
      // "corelyx" / "corelyx:primary" connection, which then fails at runtime
      // with: Connection 'corelyx:primary' not found for this user. Repair it
      // into the agent_task tool-loop that actually delivers the report, so the
      // broken connection ref never reaches the runtime.
      if (n.type === "connection") {
        const cfg = (n.config && typeof n.config === "object" ? n.config : {}) as Record<string, unknown>;
        const ref = typeof n.connection === "string" ? n.connection : "";
        const refProvider = ref.includes(":") ? ref.split(":")[0] : ref;
        if (refProvider === "corelyx" || cfg.provider === "corelyx") {
          n.type = "agent_task";
          n.connection = null;
          n.config = {
            objective:
              (typeof n.description === "string" && n.description) ||
              (typeof n.label === "string" && n.label) ||
              "Report the results back to the user.",
            model: "__USER_ASSIGNED__",
            api_key_ref: "__USER_ASSIGNED__",
            max_iterations: 4,
            tools: ["corelyx.report_to_user"],
            scope_access: "read",
            requires_approval: false,
            approval_timeout_hours: 24,
            input_schema: null,
            output_schema: null,
            retry: { max_attempts: 2, backoff: "exponential", backoff_base_seconds: 5, fail_program_on_exhaust: false },
          };
        }
      }

      if (n.type === "trigger" && n.config && typeof n.config === "object") {
        const cfg = n.config as Record<string, unknown>;

        if (typeof cfg.trigger_type === "string" && TRIGGER_TYPE_MAP[cfg.trigger_type]) {
          cfg.trigger_type = TRIGGER_TYPE_MAP[cfg.trigger_type];
        }

        const validTriggerTypes = new Set(["cron", "event", "webhook", "manual", "program_output"]);
        if (!cfg.trigger_type || !validTriggerTypes.has(cfg.trigger_type as string)) {
          if (cfg.schedule || cfg.expression || cfg.cron || cfg.cron_expression) {
            cfg.trigger_type = "cron";
          } else if (cfg.endpoint_id || cfg.url || cfg.path || cfg.webhook_url) {
            cfg.trigger_type = "webhook";
          } else if (cfg.source && cfg.event) {
            cfg.trigger_type = "event";
          } else if (cfg.source_program_id) {
            cfg.trigger_type = "program_output";
          } else {
            cfg.trigger_type = "manual";
          }
        }

        if (cfg.trigger_type === "cron") {
          if (!cfg.expression) {
            cfg.expression = cfg.cron_expression ?? cfg.schedule ?? cfg.cron ?? "0 8 * * *";
          }
          delete cfg.schedule;
          delete cfg.cron;
          delete cfg.cron_expression;
          if (!cfg.timezone) cfg.timezone = "UTC";
        }

        if (cfg.trigger_type === "webhook") {
          if (!cfg.endpoint_id) cfg.endpoint_id = crypto.randomUUID();
          if (!cfg.method) cfg.method = "POST";
        }

        if (cfg.trigger_type === "event") {
          if (!cfg.source) cfg.source = "unknown";
          if (!cfg.event) cfg.event = "trigger";
          if (!("filter" in cfg)) cfg.filter = null;
        }

        if (cfg.trigger_type === "program_output") {
          if (!cfg.source_program_id) cfg.source_program_id = "__USER_ASSIGNED__";
          if (!Array.isArray(cfg.on_status)) cfg.on_status = ["success"];
        }
      }

      if (n.type === "agent" && n.config && typeof n.config === "object") {
        const cfg = n.config as Record<string, unknown>;
        normalizeDataSchema(cfg.input_schema);
        normalizeDataSchema(cfg.output_schema);
      }

      if (n.type === "step" && n.config && typeof n.config === "object") {
        const cfg = n.config as Record<string, unknown>;
        normalizeDataSchema(cfg.input_schema);
        normalizeDataSchema(cfg.output_schema);
        normalizeDataSchema(cfg.pass_schema);
        n.connection = null;
      }

      if (n.type === "connection" && n.config && typeof n.config === "object") {
        const cfg = n.config as Record<string, unknown>;
        if (cfg.connector_type && cfg.connector_type !== "http") {
          delete cfg.connector_type;
        }
        if (typeof cfg.scope_required === "string") {
          cfg.scope_required = [cfg.scope_required];
        } else if (!Array.isArray(cfg.scope_required)) {
          cfg.scope_required = [];
        }
        const validScopeAccess = new Set(["read", "write", "read_write"]);
        if (!cfg.scope_access || !validScopeAccess.has(cfg.scope_access as string)) {
          cfg.scope_access = "read_write";
        }
        if (cfg.operation === "" || cfg.operation === null) delete cfg.operation;
        if (
          cfg.operation_params === null ||
          (typeof cfg.operation_params === "object" &&
            Object.keys(cfg.operation_params as object).length === 0)
        ) {
          delete cfg.operation_params;
        }
        // HTTP nodes: normalize headers/query_params from {Name: value} shorthand
        // to the required {key, value} pair shape that the schema validator expects.
        if (cfg.connector_type === "http") {
          for (const field of ["headers", "query_params"] as const) {
            if (!Array.isArray(cfg[field])) continue;
            cfg[field] = (cfg[field] as unknown[]).map((item) => {
              if (!item || typeof item !== "object" || Array.isArray(item)) return item;
              const obj = item as Record<string, unknown>;
              if ("key" in obj && "value" in obj) return obj;
              const entries = Object.entries(obj);
              if (entries.length === 1) return { key: entries[0]![0], value: entries[0]![1] };
              return obj;
            });
          }
        }
      }

      if (!n.status) n.status = "idle";
    }
  }

  if (Array.isArray(schema.triggers) && Array.isArray(schema.nodes)) {
    for (const trigger of schema.triggers) {
      if (!trigger || typeof trigger !== "object") continue;
      const t = trigger as Record<string, unknown>;

      const triggerNode = (schema.nodes as Record<string, unknown>[]).find(
        (n) => n.id === t.node_id && n.type === "trigger"
      );
      if (triggerNode?.config && typeof triggerNode.config === "object") {
        const nodeCfg = triggerNode.config as Record<string, unknown>;
        if (nodeCfg.trigger_type) {
          t.type = nodeCfg.trigger_type;
        }
      }

      if (typeof t.type === "string" && TRIGGER_TYPE_MAP[t.type]) {
        t.type = TRIGGER_TYPE_MAP[t.type];
      }

      if (!("is_active" in t)) t.is_active = true;
      if (!("last_fired" in t)) t.last_fired = null;
      if (!("next_scheduled" in t)) t.next_scheduled = null;
    }
  }
}
