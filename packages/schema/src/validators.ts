import { z } from "zod";

// ─── SHARED ───────────────────────────────────────────────────────────────

export const DataSchemaZ: z.ZodType<{
  type: "object" | "string" | "number" | "boolean" | "array";
  properties?: Record<string, unknown>;
  items?: unknown;
  required?: string[];
}> = z.lazy(() =>
  z.object({
    type: z.enum(["object", "string", "number", "boolean", "array"]),
    properties: z.record(DataSchemaZ).optional(),
    items: DataSchemaZ.optional(),
    required: z.array(z.string()).optional(),
  })
);

export const RetryConfigZ = z.object({
  max_attempts: z.number().int().min(1).max(5),
  backoff: z.enum(["none", "linear", "exponential"]),
  backoff_base_seconds: z.number().min(0),
  fail_program_on_exhaust: z.boolean(),
});

// ─── NODE STATUS ──────────────────────────────────────────────────────────

export const NodeStatusZ = z.enum([
  "idle",
  "running",
  "success",
  "failed",
  "waiting_approval",
  "skipped",
]);

export const RunStatusZ = z.enum([
  "success",
  "failed",
  "partial",
  "running",
  "waiting_approval",
]);

// ─── TRIGGER CONFIG ───────────────────────────────────────────────────────

export const TriggerConfigZ = z.discriminatedUnion("trigger_type", [
  z.object({
    trigger_type: z.literal("cron"),
    expression: z.string().min(1),
    timezone: z.string().min(1),
  }),
  z.object({
    trigger_type: z.literal("event"),
    source: z.string().min(1),
    event: z.string().min(1),
    filter: z.record(z.unknown()).nullable(),
  }),
  z.object({
    trigger_type: z.literal("webhook"),
    endpoint_id: z.string().min(1),
    method: z.enum(["POST", "GET"]),
  }),
  z.object({
    trigger_type: z.literal("manual"),
  }),
  z.object({
    trigger_type: z.literal("program_output"),
    source_program_id: z.string().min(1),
    on_status: z.array(RunStatusZ).min(1),
  }),
  z.object({
    trigger_type: z.literal("file_watch"),
    device_id: z.string().min(1).nullable(),
    path: z.string().min(1),
    events: z.array(z.enum(["created", "modified", "deleted"])).min(1),
    patterns: z.array(z.string()),
  }),
]);

// ─── NODE BASE ────────────────────────────────────────────────────────────

/**
 * AI-generated explainability metadata for a node.
 * Supports AI Act Art. 14/50 compliance (transparency obligation).
 */
const NodeMetadataZ = z.object({
  genesis_reasoning: z
    .object({
      reasoning: z.string(),
      alternatives: z.array(z.string()),
      confidence: z.number().min(0).max(1),
    })
    .optional(),
  generated_at: z.string().optional(),
});

const NodeBaseZ = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  status: NodeStatusZ,
  metadata: NodeMetadataZ.optional(),
});

// ─── TRIGGER NODE ─────────────────────────────────────────────────────────

export const TriggerNodeZ = NodeBaseZ.extend({
  type: z.literal("trigger"),
  connection: z.string().nullable(),
  config: TriggerConfigZ,
});

// ─── AGENT NODE ───────────────────────────────────────────────────────────

export const AgentConfigZ = z.object({
  model: z.string().min(1),
  api_key_ref: z.string().min(1),
  system_prompt: z.string(),
  input_schema: DataSchemaZ.nullable(),
  output_schema: DataSchemaZ.nullable(),
  requires_approval: z.boolean(),
  approval_timeout_hours: z.number().min(0),
  approval_approver: z.string().max(200).optional(),
  approval_reason: z.string().max(500).optional(),
  scope_required: z.string().nullable(),
  scope_access: z.enum(["read", "write", "read_write"]),
  retry: RetryConfigZ,
  tools: z.array(z.string()),
});

export const AgentNodeZ = NodeBaseZ.extend({
  type: z.literal("agent"),
  connection: z.string().nullable(),
  config: AgentConfigZ,
});

// ─── AGENT TASK NODE ──────────────────────────────────────────────────────

export const AgentTaskConfigZ = z.object({
  objective: z.string(),
  model: z.string().min(1),
  api_key_ref: z.string().min(1),
  max_iterations: z.number().int().min(1).max(25),
  tools: z.array(z.string()),
  scope_access: z.enum(["read", "write", "read_write"]),
  requires_approval: z.boolean(),
  approval_timeout_hours: z.number().min(0),
  approval_approver: z.string().max(200).optional(),
  approval_reason: z.string().max(500).optional(),
  input_schema: DataSchemaZ.nullable(),
  output_schema: DataSchemaZ.nullable(),
  retry: RetryConfigZ,
});

export const AgentTaskNodeZ = NodeBaseZ.extend({
  type: z.literal("agent_task"),
  connection: z.string().nullable(),
  config: AgentTaskConfigZ,
});

// ─── STEP NODE ────────────────────────────────────────────────────────────

export const StepConfigZ = z.discriminatedUnion("logic_type", [
  z.object({
    logic_type: z.literal("transform"),
    transformation: z.string().min(1),
    input_schema: DataSchemaZ.nullable(),
    output_schema: DataSchemaZ.nullable(),
  }),
  z.object({
    logic_type: z.literal("filter"),
    condition: z.string().min(1),
    pass_schema: DataSchemaZ.nullable(),
  }),
  z.object({
    logic_type: z.literal("branch"),
    conditions: z
      .array(z.object({ condition: z.string().min(1), target_node_id: z.string().min(1) }))
      .min(1),
    default_branch: z.string().min(1),
  }),
  z.object({
    logic_type: z.literal("delay"),
    seconds: z.number().min(0),
  }),
  z.object({
    logic_type: z.literal("loop"),
    over: z.string().min(1),
    item_var: z.string().min(1),
  }),
  z.object({
    logic_type: z.literal("format"),
    template: z.string().min(1),
    output_key: z.string().min(1),
  }),
  z.object({
    logic_type: z.literal("parse"),
    input_key: z.string().min(1),
    format: z.enum(["json", "csv", "lines"]),
  }),
  z.object({
    logic_type: z.literal("deduplicate"),
    key: z.string().min(1),
  }),
  z.object({
    logic_type: z.literal("sort"),
    key: z.string().min(1),
    order: z.enum(["asc", "desc"]),
  }),
]);

export const StepNodeZ = NodeBaseZ.extend({
  type: z.literal("step"),
  connection: z.null(),
  config: StepConfigZ,
});

// ─── CONNECTION NODE ──────────────────────────────────────────────────────

export const ConnectionNodeZ = NodeBaseZ.extend({
  type: z.literal("connection"),
  connection: z.string().nullable(),
  config: z.union([
    z.object({
      // Optional for backward compatibility with older schemas.
      connector_type: z.literal("oauth").optional(),
      provider: z.string().optional(),
      scope_access: z.enum(["read", "write", "read_write"]),
      scope_required: z.array(z.string()),
      operation: z.string().optional(),
      operation_params: z.record(z.unknown()).optional(),
    }),
    z.object({
      connector_type: z.literal("http"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
      url: z.string().min(1),
      auth_type: z.enum(["none", "bearer", "basic", "api_key_header", "api_key_query"]),
      auth_value: z.string().nullable(),
      query_params: z.array(z.object({ key: z.string(), value: z.string() })),
      headers: z.array(z.object({ key: z.string(), value: z.string() })),
      body: z.string().nullable(),
      parse_response: z.boolean(),
      timeout_seconds: z.number().positive().nullable(),
      retry: RetryConfigZ.nullable(),
    }),
    z.object({
      // Local file operation executed by the desktop Bridge (see FileConnectionConfig).
      connector_type: z.literal("file"),
      device_id: z.string().nullable(),
      operation: z.enum([
        "read", "write", "append", "list", "stat",
        "move", "copy", "delete", "mkdir", "search",
      ]),
      operation_params: z.record(z.unknown()),
      scope_access: z.enum(["read", "write", "read_write"]),
    }),
  ]),
});

// ─── NOTE NODE ────────────────────────────────────────────────────────────

export const NoteNodeZ = NodeBaseZ.extend({
  type: z.literal("note"),
  connection: z.null(),
  config: z.object({
    content: z.string(),
    color: z.enum(["yellow", "blue", "pink", "green"]),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  }),
});

// ─── GROUP NODE ───────────────────────────────────────────────────────────

export const GroupNodeZ = NodeBaseZ.extend({
  type: z.literal("group"),
  connection: z.null(),
  config: z.object({
    childIds: z.array(z.string()),
    width: z.number().positive(),
    height: z.number().positive(),
    color: z.enum(["zinc", "blue", "green", "amber", "pink"]).optional(),
  }),
});

// ─── NODES UNION ──────────────────────────────────────────────────────────

export const NodeZ = z.discriminatedUnion("type", [
  TriggerNodeZ,
  AgentNodeZ,
  AgentTaskNodeZ,
  StepNodeZ,
  ConnectionNodeZ,
  NoteNodeZ,
  GroupNodeZ,
]);

// ─── EDGES ────────────────────────────────────────────────────────────────

export const EdgeZ = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(["data_flow", "control_flow", "event_subscription"]),
  data_mapping: z.record(z.string()).nullable(),
  condition: z.string().nullable(),
  label: z.string().nullable(),
});

// ─── TRIGGER INDEX ────────────────────────────────────────────────────────

export const TriggerZ = z.object({
  node_id: z.string().min(1),
  type: z.enum(["cron", "event", "webhook", "manual", "program_output", "file_watch"]),
  is_active: z.boolean(),
  last_fired: z.string().nullable(),
  next_scheduled: z.string().nullable(),
});

// ─── VERSION SNAPSHOT ─────────────────────────────────────────────────────

export const VersionSnapshotZ = z.object({
  version_number: z.number().int().min(0),
  timestamp: z.string().min(1),
  changed_by: z.enum(["genesis", "user", "system"]),
  change_summary: z.string(),
  snapshot: z.object({
    nodes: z.array(NodeZ),
    edges: z.array(EdgeZ),
    triggers: z.array(TriggerZ),
  }),
});

// ─── METADATA ─────────────────────────────────────────────────────────────

export const ProgramMetadataZ = z.object({
  description: z.string(),
  genesis_model: z.string(),
  genesis_timestamp: z.string(),
  tags: z.array(z.string()),
  is_active: z.boolean(),
  last_run_id: z.string().nullable(),
  last_run_status: RunStatusZ.nullable(),
  last_run_timestamp: z.string().nullable(),
  ai_use_case_category: z.string().nullable().optional(),
  ai_act_risk_level: z
    .enum([
      "prohibited",
      "high_risk",
      "transparency",
      "gpai_related",
      "limited_or_minimal",
      "unknown",
    ])
    .optional(),
  customer_role: z
    .enum([
      "provider",
      "deployer",
      "distributor",
      "importer",
      "product_manufacturer",
      "unknown",
    ])
    .optional(),
  human_oversight_required: z.boolean().optional(),
  transparency_notice_required: z.boolean().optional(),
  high_risk_documentation_required: z.boolean().optional(),
  prohibited_reason: z.string().nullable().optional(),
  reviewer: z.string().nullable().optional(),
  reviewed_at: z.string().nullable().optional(),
  ai_act_notes: z.string().nullable().optional(),
  legal_review_override: z.boolean().optional(),
});

// ─── PROGRAM SCHEMA ───────────────────────────────────────────────────────

// Legacy schemas predate program_type and are always workflows — default it so
// downstream consumers can rely on the field being present after validation.
export const ProgramTypeZ = z.enum(["workflow", "agent"]).default("workflow");

// agent_task is the hybrid autonomous tool-loop node. It is only valid inside
// agent programs — workflows must never contain one. Enforce that here so the
// canonical contract rejects it regardless of how the schema was produced.
function refineAgentTaskScope(
  schema: { program_type?: "workflow" | "agent"; nodes: Array<{ type: string }> },
  ctx: z.RefinementCtx
): void {
  if (schema.program_type === "agent") return;
  schema.nodes.forEach((node, index) => {
    if (node.type === "agent_task") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodes", index, "type"],
        message: "agent_task nodes are only allowed in agents, not workflows",
      });
    }
  });
}

export const ProgramSchemaZ = z
  .object({
    version: z.literal("1.0"),
    program_id: z.string().min(1),
    program_name: z.string().min(1),
    program_type: ProgramTypeZ,
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
    execution_mode: z.enum(["autonomous", "approval_required", "supervised"]),
    nodes: z.array(NodeZ),
    edges: z.array(EdgeZ),
    triggers: z.array(TriggerZ),
    version_history: z.array(VersionSnapshotZ),
    metadata: ProgramMetadataZ,
  })
  .superRefine(refineAgentTaskScope);

export type ProgramSchemaInput = z.input<typeof ProgramSchemaZ>;
export type ProgramSchemaOutput = z.output<typeof ProgramSchemaZ>;

// ─── DRAFT PROGRAM SCHEMA ───────────────────────────────────────────────────
// Persistence-level validation for partially-built workflows. This keeps the
// canonical top-level shape and graph references safe while allowing incomplete
// node config values that are not runnable yet.

export const DraftNodeZ = NodeBaseZ.extend({
  type: z.enum(["trigger", "agent", "agent_task", "step", "connection", "note", "group"]),
  connection: z.string().nullable(),
  config: z.record(z.unknown()),
});

export const DraftEdgeZ = EdgeZ;

export const ProgramDraftSchemaZ = z
  .object({
    version: z.literal("1.0"),
    program_id: z.string().min(1),
    program_name: z.string().min(1),
    program_type: ProgramTypeZ,
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
    execution_mode: z.enum(["autonomous", "approval_required", "supervised"]),
    nodes: z.array(DraftNodeZ),
    edges: z.array(DraftEdgeZ),
    triggers: z.array(TriggerZ),
    version_history: z.array(z.unknown()),
    metadata: ProgramMetadataZ,
  })
  .superRefine((schema, ctx) => {
    const nodeIds = new Set(schema.nodes.map((node) => node.id));
    for (const edge of schema.edges) {
      if (!nodeIds.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", edge.id, "from"],
          message: `Edge ${edge.id} references missing source node ${edge.from}`,
        });
      }
      if (!nodeIds.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", edge.id, "to"],
          message: `Edge ${edge.id} references missing target node ${edge.to}`,
        });
      }
    }

    refineAgentTaskScope(schema, ctx);

    const triggerNodeIds = new Set(
      schema.nodes.filter((node) => node.type === "trigger").map((node) => node.id)
    );
    for (const trigger of schema.triggers) {
      if (!triggerNodeIds.has(trigger.node_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["triggers", trigger.node_id],
          message: `Trigger index references missing trigger node ${trigger.node_id}`,
        });
      }
    }
  });

export type ProgramDraftSchemaInput = z.input<typeof ProgramDraftSchemaZ>;
export type ProgramDraftSchemaOutput = z.output<typeof ProgramDraftSchemaZ>;
