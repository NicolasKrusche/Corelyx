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
