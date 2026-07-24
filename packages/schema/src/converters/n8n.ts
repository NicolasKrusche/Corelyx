// ─── n8n → Corelyx converter ────────────────────────────────────────────────
//
// Best-effort migration of an exported n8n workflow into a Corelyx canonical
// ProgramSchema. n8n and Corelyx do not share a node vocabulary, so this maps
// the common node types and records a warning for anything it cannot map
// faithfully. The output is a *draft* — the caller (import route) is expected to
// re-stamp program_id / timestamps and run it through the schema validators.
//
// Mapping table (n8n type → Corelyx node):
//   if / switch          → step  (branch)
//   httpRequest          → connection (http)   — "http_generic"
//   set                  → step  (transform)
//   function / code      → agent (code)
//   webhook              → trigger (webhook)
//   scheduleTrigger/cron → trigger (cron)
//   manualTrigger        → trigger (manual)
//   stickyNote / noOp    → note
// Everything else becomes a note placeholder plus a warning, so the graph stays
// connected and the user can see what still needs porting.

import type {
  ProgramSchema,
  Node,
  Edge,
  Trigger,
  RetryConfig,
  StepNode,
} from "../types";

// ─── n8n input shapes (loosely typed — we validate defensively) ─────────────

interface N8nNode {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: [number, number] | { 0: number; 1: number };
  parameters?: Record<string, unknown>;
  disabled?: boolean;
  webhookId?: string;
}

interface N8nConnectionTarget {
  node: string;
  type?: string;
  index?: number;
}

interface N8nWorkflow {
  name?: string;
  nodes: N8nNode[];
  // { [sourceNodeName]: { main: N8nConnectionTarget[][] } }
  connections?: Record<string, { main?: N8nConnectionTarget[][] } | undefined>;
  active?: boolean;
}

export interface N8nConversionResult {
  schema: ProgramSchema;
  warnings: string[];
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_RETRY: RetryConfig = {
  max_attempts: 1,
  backoff: "none",
  backoff_base_seconds: 0,
  fail_program_on_exhaust: false,
};

// A fixed, deterministic timestamp keeps conversion pure/testable; the import
// route overwrites created_at / updated_at with the real insert time anyway.
const PLACEHOLDER_TS = "1970-01-01T00:00:00.000Z";

// ─── Helpers ──────────────────────────────────────────────────────────────

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "node";
}

/** Normalise an n8n node type to its bare kind, e.g. "n8n-nodes-base.httpRequest" → "httprequest". */
function normalizeType(type: string): string {
  const bare = type.includes(".") ? type.slice(type.lastIndexOf(".") + 1) : type;
  return bare.toLowerCase();
}

function readPosition(node: N8nNode): { x: number; y: number } {
  const pos = node.position as unknown;
  if (Array.isArray(pos) && pos.length >= 2 && typeof pos[0] === "number" && typeof pos[1] === "number") {
    return { x: pos[0], y: pos[1] };
  }
  return { x: 0, y: 0 };
}

function isN8nWorkflow(value: unknown): value is N8nWorkflow {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as { nodes?: unknown }).nodes)
  );
}

// ─── Converter ──────────────────────────────────────────────────────────────

export function convertN8nToCorelyx(n8nJson: unknown): N8nConversionResult {
  const warnings: string[] = [];

  if (!isN8nWorkflow(n8nJson)) {
    throw new Error(
      "Input is not a recognisable n8n workflow export (expected an object with a `nodes` array)."
    );
  }

  const workflow = n8nJson;
  const workflowName = typeof workflow.name === "string" && workflow.name.trim() ? workflow.name.trim() : "Imported n8n workflow";

  // 1. Assign a stable Corelyx id to every n8n node and remember the name→id map
  //    (n8n `connections` reference nodes by their display name, not id).
  const idByName = new Map<string, string>();
  const usedIds = new Set<string>();
  workflow.nodes.forEach((node, index) => {
    const base = `n8n-${index}-${slugify(node.name || node.id || `node-${index}`)}`;
    let id = base;
    let suffix = 1;
    while (usedIds.has(id)) id = `${base}-${suffix++}`;
    usedIds.add(id);
    idByName.set(node.name, id);
  });

  // 2. Build outgoing target lists per source node (by output index) so branch
  //    nodes can wire their conditions and every connection becomes an edge.
  const connections = workflow.connections ?? {};

  const nodes: Node[] = [];
  const triggers: Trigger[] = [];
  const branchNodeNames = new Set<string>();

  for (let index = 0; index < workflow.nodes.length; index++) {
    const raw = workflow.nodes[index];
    const id = idByName.get(raw.name)!;
    const kind = normalizeType(raw.type);
    const position = readPosition(raw);
    const label = raw.name || kind;
    const params = raw.parameters ?? {};

    const base = {
      id,
      label,
      description: `Imported from n8n (${raw.type})`,
      position,
      status: "idle" as const,
    };

    switch (kind) {
      case "if":
      case "switch": {
        branchNodeNames.add(raw.name);
        // Conditions are wired in a later pass once edges are known; seed with a
        // placeholder so the node is structurally valid on its own.
        const node: StepNode = {
          ...base,
          type: "step",
          connection: null,
          config: {
            logic_type: "branch",
            conditions: [{ condition: "true", target_node_id: id }],
            default_branch: id,
          },
        };
        nodes.push(node);
        warnings.push(
          `Node "${raw.name}" (${kind}) was converted to a branch step — review its conditions, n8n expressions are not translated.`
        );
        break;
      }

      case "httprequest": {
        const method = String((params.method as string) ?? "GET").toUpperCase();
        const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
        const url = typeof params.url === "string" ? params.url : "";
        nodes.push({
          ...base,
          type: "connection",
          connection: null,
          config: {
            connector_type: "http",
            method: (allowedMethods.includes(method) ? method : "GET") as
              | "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS",
            url,
            auth_type: "none",
            auth_value: null,
            query_params: [],
            headers: [],
            body: null,
            parse_response: true,
            timeout_seconds: null,
            retry: null,
          },
        });
        if (!url) {
          warnings.push(`HTTP Request node "${raw.name}" has no static URL — set it manually after import.`);
        }
        break;
      }

      case "set": {
        const summary = summariseSetParams(params);
        nodes.push({
          ...base,
          type: "step",
          connection: null,
          config: {
            logic_type: "transform",
            transformation: summary,
            input_schema: null,
            output_schema: null,
          },
        });
        break;
      }

      case "function":
      case "functionitem":
      case "code": {
        const code =
          (typeof params.functionCode === "string" && params.functionCode) ||
          (typeof params.jsCode === "string" && params.jsCode) ||
          (typeof params.code === "string" && params.code) ||
          "";
        nodes.push({
          ...base,
          type: "agent",
          connection: null,
          config: {
            model: "__USER_ASSIGNED__",
            api_key_ref: "__USER_ASSIGNED__",
            system_prompt: code
              ? `Ported from an n8n Function/Code node. Original code:\n\n${code}`
              : "Ported from an n8n Function/Code node (no code found).",
            input_schema: null,
            output_schema: null,
            requires_approval: false,
            approval_timeout_hours: 24,
            scope_required: null,
            scope_access: "read",
            retry: DEFAULT_RETRY,
            tools: [],
          },
        });
        warnings.push(
          `Node "${raw.name}" (${kind}) became a code agent — its JavaScript is preserved as a prompt but must be re-implemented as a Corelyx step/agent.`
        );
        break;
      }

      case "webhook": {
        nodes.push({
          ...base,
          type: "trigger",
          connection: null,
          config: {
            trigger_type: "webhook",
            endpoint_id: raw.webhookId || id,
            method: String((params.httpMethod as string) ?? "POST").toUpperCase() === "GET" ? "GET" : "POST",
          },
        });
        triggers.push({ node_id: id, type: "webhook", is_active: false, last_fired: null, next_scheduled: null });
        break;
      }

      case "scheduletrigger":
      case "cron":
      case "interval": {
        const expression = extractCronExpression(params);
        nodes.push({
          ...base,
          type: "trigger",
          connection: null,
          config: {
            trigger_type: "cron",
            expression,
            timezone: "UTC",
          },
        });
        triggers.push({ node_id: id, type: "cron", is_active: false, last_fired: null, next_scheduled: null });
        if (expression === "0 * * * *") {
          warnings.push(`Schedule node "${raw.name}" — could not read its interval, defaulted to hourly ("0 * * * *").`);
        }
        break;
      }

      case "manualtrigger": {
        nodes.push({
          ...base,
          type: "trigger",
          connection: null,
          config: { trigger_type: "manual" },
        });
        triggers.push({ node_id: id, type: "manual", is_active: false, last_fired: null, next_scheduled: null });
        break;
      }

      case "stickynote":
      case "noop": {
        nodes.push({
          ...base,
          type: "note",
          connection: null,
          config: {
            content: typeof params.content === "string" ? params.content : label,
            color: "yellow",
          },
        });
        break;
      }

      default: {
        // Unmappable — keep it as a note placeholder so edges stay valid and warn.
        nodes.push({
          ...base,
          type: "note",
          connection: null,
          config: {
            content: `Unsupported n8n node "${raw.name}" (${raw.type}). Recreate this manually.`,
            color: "pink",
          },
        });
        warnings.push(`Node "${raw.name}" (${raw.type}) has no Corelyx equivalent and was left as a note placeholder.`);
      }
    }
  }

  // 3. Edges — one Corelyx edge per n8n connection target.
  const edges: Edge[] = [];
  // outputsByName: source name → output index → ordered target ids
  const outputsByName = new Map<string, string[][]>();
  let edgeCounter = 0;

  for (const [sourceName, conn] of Object.entries(connections)) {
    const fromId = idByName.get(sourceName);
    if (!fromId || !conn?.main) continue;
    const outputs: string[][] = [];
    conn.main.forEach((outputTargets, outputIndex) => {
      const targetIds: string[] = [];
      (outputTargets ?? []).forEach((target) => {
        const toId = idByName.get(target.node);
        if (!toId) {
          warnings.push(`Connection from "${sourceName}" points to unknown node "${target.node}" — dropped.`);
          return;
        }
        targetIds.push(toId);
        const isBranch = branchNodeNames.has(sourceName);
        edges.push({
          id: `edge-${edgeCounter++}-${fromId}-${toId}`,
          from: fromId,
          to: toId,
          type: isBranch ? "control_flow" : "data_flow",
          data_mapping: null,
          condition: null,
          label: isBranch ? `output ${outputIndex}` : null,
        });
      });
      outputs[outputIndex] = targetIds;
    });
    outputsByName.set(sourceName, outputs);
  }

  // 4. Wire branch conditions from the resolved outputs (index 0 = first branch,
  //    last populated output = default).
  for (const node of nodes) {
    if (node.type !== "step" || node.config.logic_type !== "branch") continue;
    const sourceName = [...idByName.entries()].find(([, id]) => id === node.id)?.[0];
    if (!sourceName) continue;
    const outputs = outputsByName.get(sourceName);
    if (!outputs || outputs.length === 0) continue;

    const built: { condition: string; target_node_id: string }[] = [];
    outputs.forEach((targets, outputIndex) => {
      const target = targets.find(Boolean);
      if (target) built.push({ condition: `output_${outputIndex}`, target_node_id: target });
    });
    if (built.length > 0) {
      // Last output is treated as the fall-through / default branch.
      const defaultBranch = built[built.length - 1].target_node_id;
      const conds = built.length > 1 ? built.slice(0, -1) : built;
      node.config = {
        logic_type: "branch",
        conditions: conds,
        default_branch: defaultBranch,
      };
    }
  }

  const schema: ProgramSchema = {
    version: "1.0",
    program_id: `n8n-${slugify(workflowName)}`,
    program_name: workflowName,
    program_type: "workflow",
    created_at: PLACEHOLDER_TS,
    updated_at: PLACEHOLDER_TS,
    execution_mode: "supervised",
    nodes,
    edges,
    triggers,
    version_history: [],
    metadata: {
      description: `Migrated from n8n workflow "${workflowName}".`,
      genesis_model: "n8n-import",
      genesis_timestamp: PLACEHOLDER_TS,
      tags: ["imported", "n8n"],
      is_active: false,
      last_run_id: null,
      last_run_status: null,
      last_run_timestamp: null,
    },
  };

  if (nodes.length === 0) {
    warnings.push("The n8n workflow contained no nodes.");
  }

  return { schema, warnings };
}

// ─── Param extraction helpers ────────────────────────────────────────────────

function summariseSetParams(params: Record<string, unknown>): string {
  // n8n "Set" stores assignments under a few shapes across versions. Produce a
  // human-readable transform description rather than trying to run its logic.
  const values = params.values as Record<string, unknown> | undefined;
  const assignments = (params.assignments as { assignments?: unknown[] } | undefined)?.assignments;
  const fields: string[] = [];

  if (values && typeof values === "object") {
    for (const group of Object.values(values)) {
      if (Array.isArray(group)) {
        for (const entry of group) {
          const name = (entry as { name?: string })?.name;
          if (name) fields.push(name);
        }
      }
    }
  }
  if (Array.isArray(assignments)) {
    for (const entry of assignments) {
      const name = (entry as { name?: string })?.name;
      if (name) fields.push(name);
    }
  }

  if (fields.length === 0) return "Set fields (imported from n8n — configure the transformation).";
  return `Set fields: ${fields.join(", ")} (imported from n8n — review the transformation).`;
}

function extractCronExpression(params: Record<string, unknown>): string {
  // n8n schedule/cron nodes carry the expression in several places depending on
  // version. Fall back to hourly if nothing recognisable is present.
  const direct = params.cronExpression ?? params.expression ?? params.triggerTimes;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const rule = params.rule as { interval?: Array<Record<string, unknown>> } | undefined;
  const interval = rule?.interval?.[0];
  if (interval) {
    if (typeof interval.expression === "string" && interval.expression.trim()) return interval.expression.trim();
    const field = typeof interval.field === "string" ? interval.field : "";
    if (field === "minutes") return "* * * * *";
    if (field === "hours") return "0 * * * *";
    if (field === "days") return "0 0 * * *";
    if (field === "weeks") return "0 0 * * 0";
  }
  return "0 * * * *";
}
