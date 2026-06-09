import { describe, expect, it } from "vitest";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { validatePostGenesis } from "../index";

// agent_task is the hybrid autonomous tool-loop node — valid only inside agent
// programs (program_type === "agent"). These tests pin that it can never be
// smuggled into a workflow, at both the canonical-schema layer and the
// post-genesis graph-validation layer.

function program(programType: "workflow" | "agent"): Record<string, unknown> {
  return {
    version: "1.0",
    program_id: "prog-1",
    program_name: "Test",
    program_type: programType,
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
        label: "Do the thing",
        description: "",
        connection: null,
        config: {
          objective: "Investigate and report",
          model: "__USER_ASSIGNED__",
          api_key_ref: "__USER_ASSIGNED__",
          max_iterations: 6,
          tools: ["corelyx.list_runs"],
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
      description: "x",
      genesis_model: "m",
      genesis_timestamp: "2026-06-04T00:00:00Z",
      tags: [],
      is_active: false,
      last_run_id: null,
      last_run_status: null,
      last_run_timestamp: null,
    },
  };
}

describe("ProgramSchemaZ agent_task scope", () => {
  it("rejects an agent_task node in a workflow", () => {
    const result = ProgramSchemaZ.safeParse(program("workflow"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => /agent_task/.test(issue.message))
      ).toBe(true);
    }
  });

  it("accepts an agent_task node in an agent", () => {
    const result = ProgramSchemaZ.safeParse(program("agent"));
    expect(result.success).toBe(true);
  });
});

describe("validatePostGenesis agent_task scope", () => {
  it("flags an agent_task node with ERR_013 in a workflow", () => {
    const result = validatePostGenesis(program("workflow") as unknown as ProgramSchema, []);
    const err013 = result.errors.find((e) => e.code === "ERR_013");
    expect(err013).toBeDefined();
    expect(err013?.node_id).toBe("n2");
    expect(result.node_states.n2).toBe("error");
  });

  it("does not flag an agent_task node in an agent", () => {
    const result = validatePostGenesis(program("agent") as unknown as ProgramSchema, []);
    expect(result.errors.some((e) => e.code === "ERR_013")).toBe(false);
  });
});
