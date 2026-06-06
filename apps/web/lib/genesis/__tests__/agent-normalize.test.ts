import { describe, expect, it } from "vitest";
import { normalizeSchema } from "../parsing";
import { normalizeProgramDraft } from "../../workflow/normalize";

// Regression: agent_task carries scope_access + model, which previously caused
// the normalizers to coerce it into a connection node (an OAuth node with no
// connection reference) or a plain agent node — destroying the tool-loop config.

function agentSchema() {
  return {
    version: "1.0",
    program_id: "__GENERATED__",
    program_name: "Test Agent",
    program_type: "agent",
    created_at: "2026-06-04T00:00:00Z",
    updated_at: "2026-06-04T00:00:00Z",
    execution_mode: "autonomous",
    nodes: [
      {
        id: "n1",
        type: "trigger",
        label: "Start",
        description: "",
        connection: null,
        config: { trigger_type: "manual" },
        position: { x: 0, y: 0 },
        status: "idle",
      },
      {
        id: "n2",
        type: "agent_task",
        label: "Investigate failures",
        description: "",
        connection: null,
        config: {
          objective: "Find failing workflows and summarize",
          model: "__USER_ASSIGNED__",
          api_key_ref: "__USER_ASSIGNED__",
          max_iterations: 6,
          tools: ["corelyx.list_runs", "corelyx.get_run"],
          scope_access: "read",
          requires_approval: false,
          approval_timeout_hours: 24,
          input_schema: null,
          output_schema: null,
          retry: { max_attempts: 2, backoff: "exponential", backoff_base_seconds: 5, fail_program_on_exhaust: false },
        },
        position: { x: 320, y: 0 },
        status: "idle",
      },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", type: "data_flow", data_mapping: null, condition: null, label: null },
    ],
    triggers: [{ node_id: "n1", type: "manual", is_active: true, last_fired: null, next_scheduled: null }],
    version_history: [],
    metadata: {
      description: "x", genesis_model: "m", genesis_timestamp: "2026-06-04T00:00:00Z",
      tags: [], is_active: false, last_run_id: null, last_run_status: null, last_run_timestamp: null,
    },
  };
}

describe("agent_task normalization", () => {
  it("keeps the agent_task node type and config through normalizeSchema", () => {
    const schema = agentSchema();
    normalizeSchema(schema);
    const node = schema.nodes.find((n) => n.id === "n2")!;
    expect(node.type).toBe("agent_task");
    expect((node.config as { tools: string[] }).tools).toEqual(["corelyx.list_runs", "corelyx.get_run"]);
  });

  it("keeps the agent_task node intact through normalizeProgramDraft", () => {
    const schema = agentSchema();
    normalizeSchema(schema);
    const normalized = normalizeProgramDraft(schema) as { nodes: Array<{ id: string; type: string; config: Record<string, unknown> }> };
    const node = normalized.nodes.find((n) => n.id === "n2")!;
    expect(node.type).toBe("agent_task");
    expect(node.config.objective).toBe("Find failing workflows and summarize");
    expect(node.config.max_iterations).toBe(6);
    expect(node.config.tools).toEqual(["corelyx.list_runs", "corelyx.get_run"]);
    // Must NOT have been coerced into a connection node.
    expect(node.config.connector_type).toBeUndefined();
    expect(node.config.scope_required).toBeUndefined();
  });
});

// Regression: planners sometimes model the "report back to the user" step as a
// connection node pointing at the internal "corelyx" toolset, which is not a
// connectable OAuth provider. At runtime the executor can't resolve
// "corelyx:primary" and fails with "Connection 'corelyx:primary' not found for
// this user". normalizeSchema must repair it into the agent_task tool-loop.
describe("corelyx connection-node repair", () => {
  function reportConnectionNode(connection: string, config: Record<string, unknown>) {
    return {
      version: "1.0",
      program_id: "__GENERATED__",
      program_name: "Delete Spam Emails",
      program_type: "agent",
      created_at: "2026-06-04T00:00:00Z",
      updated_at: "2026-06-04T00:00:00Z",
      execution_mode: "autonomous",
      nodes: [
        {
          id: "n1", type: "trigger", label: "Start", description: "", connection: null,
          config: { trigger_type: "manual" }, position: { x: 0, y: 0 }, status: "idle",
        },
        {
          id: "n3", type: "connection", label: "Report Summary",
          description: "Send a summary report to the user",
          connection, config, position: { x: 320, y: 0 }, status: "idle",
        },
      ],
      edges: [{ id: "e1", from: "n1", to: "n3", type: "data_flow", data_mapping: null, condition: null, label: null }],
      triggers: [{ node_id: "n1", type: "manual", is_active: true, last_fired: null, next_scheduled: null }],
      version_history: [],
      metadata: {
        description: "x", genesis_model: "m", genesis_timestamp: "2026-06-04T00:00:00Z",
        tags: [], is_active: false, last_run_id: null, last_run_status: null, last_run_timestamp: null,
      },
    };
  }

  it("rewrites a 'corelyx:primary' connection node into a report_to_user agent_task", () => {
    const schema = reportConnectionNode("corelyx:primary", { provider: "corelyx", operation: "report_to_user" });
    normalizeSchema(schema);
    const node = schema.nodes.find((n) => n.id === "n3")! as { type: string; connection: unknown; config: Record<string, unknown> };
    expect(node.type).toBe("agent_task");
    expect(node.connection).toBeNull();
    expect(node.config.tools).toEqual(["corelyx.report_to_user"]);
    expect(node.config.objective).toBe("Send a summary report to the user");
    expect(node.config.requires_approval).toBe(false);
    // Must NOT retain connector-shaped fields that would re-trip the runtime.
    expect(node.config.provider).toBeUndefined();
    expect(node.config.operation).toBeUndefined();
  });

  it("repairs based on config.provider even when connection has no alias", () => {
    const schema = reportConnectionNode("corelyx", { provider: "corelyx" });
    normalizeSchema(schema);
    const node = schema.nodes.find((n) => n.id === "n3")! as { type: string; config: Record<string, unknown> };
    expect(node.type).toBe("agent_task");
    expect(node.config.tools).toEqual(["corelyx.report_to_user"]);
  });

  it("leaves real OAuth connection nodes (e.g. gmail:primary) untouched", () => {
    const schema = reportConnectionNode("gmail:primary", { provider: "gmail", operation: "list_emails", scope_access: "read" });
    normalizeSchema(schema);
    const node = schema.nodes.find((n) => n.id === "n3")! as { type: string; config: Record<string, unknown> };
    expect(node.type).toBe("connection");
    expect(node.config.provider).toBe("gmail");
  });
});
