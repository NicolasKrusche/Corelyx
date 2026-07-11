import { describe, expect, it } from "vitest";
import type { ProgramSchema } from "@flowos/schema";
import { validatePostGenesis } from "@/lib/validation";
import {
  applyDeterministicRepairs,
  buildParamRepairPrompt,
  collectParamRepairCandidates,
  repairMissingOperationParams,
} from "../semantic-repair";

function makeSchema(overrides?: Partial<ProgramSchema>): ProgramSchema {
  const base: ProgramSchema = {
    version: "1.0",
    program_id: "prog-1",
    program_name: "Repair Test",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    execution_mode: "supervised",
    nodes: [
      {
        id: "n1",
        type: "trigger",
        label: "Manual trigger",
        description: "Start manually",
        position: { x: 100, y: 100 },
        status: "idle",
        connection: null,
        config: { trigger_type: "manual" },
      },
    ],
    edges: [],
    triggers: [
      { node_id: "n1", type: "manual", is_active: false, last_fired: null, next_scheduled: null },
    ],
    version_history: [],
    metadata: {
      description: "test",
      genesis_model: "test-model",
      genesis_timestamp: "2026-04-12T00:00:00.000Z",
      tags: [],
      is_active: false,
      last_run_id: null,
      last_run_status: null,
      last_run_timestamp: null,
    },
  };

  return {
    ...base,
    ...overrides,
    nodes: overrides?.nodes ?? base.nodes,
    edges: overrides?.edges ?? base.edges,
    triggers: overrides?.triggers ?? base.triggers,
  };
}

describe("applyDeterministicRepairs", () => {
  it("nulls a stray connection on a step node (ERR_009)", () => {
    const schema = makeSchema({
      nodes: [
        makeSchema().nodes[0]!,
        {
          id: "n2",
          type: "step",
          label: "Filter",
          description: "",
          position: { x: 300, y: 100 },
          status: "idle",
          connection: "Gmail" as unknown as null,
          config: { logic_type: "filter", condition: "True", pass_schema: null },
        },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", type: "data_flow", data_mapping: null, condition: null, label: null }],
    });

    const validation = validatePostGenesis(schema, []);
    expect(validation.errors.some((e) => e.code === "ERR_009")).toBe(true);

    const { fixedNodeIds } = applyDeterministicRepairs(schema, validation);
    expect(fixedNodeIds).toContain("n2");
    expect(schema.nodes[1]!.connection).toBeNull();

    const revalidated = validatePostGenesis(schema, []);
    expect(revalidated.errors.some((e) => e.code === "ERR_009")).toBe(false);
  });

  it("downgrades scope_access to read when write wasn't granted (ERR_012)", () => {
    const schema = makeSchema({
      nodes: [
        makeSchema().nodes[0]!,
        {
          id: "n2",
          type: "connection",
          label: "Send",
          description: "",
          position: { x: 300, y: 100 },
          status: "idle",
          connection: "Gmail",
          config: {
            connector_type: "oauth",
            provider: "gmail",
            operation: "send_email",
            operation_params: { to: "a@b.com", subject: "hi", body: "hi" },
            scope_access: "write",
            scope_required: [],
          },
        },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", type: "data_flow", data_mapping: null, condition: null, label: null }],
    });

    const connections = [{ id: "c1", name: "Gmail", provider: "gmail", scopes: ["readonly"] }];
    const validation = validatePostGenesis(schema, connections);
    expect(validation.errors.some((e) => e.code === "ERR_012")).toBe(true);

    const { fixedNodeIds } = applyDeterministicRepairs(schema, validation);
    expect(fixedNodeIds).toContain("n2");
    const node = schema.nodes[1]!;
    expect(node.type === "connection" && node.config.connector_type === "oauth" && node.config.scope_access).toBe("read");

    const revalidated = validatePostGenesis(schema, connections);
    expect(revalidated.errors.some((e) => e.code === "ERR_012")).toBe(false);
  });

  it("removes an agent_task node from a workflow-type program (ERR_013)", () => {
    const schema = makeSchema({
      program_type: "workflow",
      nodes: [
        makeSchema().nodes[0]!,
        {
          id: "n2",
          type: "agent_task",
          label: "Rogue agent task",
          description: "",
          position: { x: 300, y: 100 },
          status: "idle",
          connection: null,
          config: {
            objective: "do stuff",
            model: "__USER_ASSIGNED__",
            api_key_ref: "__USER_ASSIGNED__",
            max_iterations: 5,
            tools: [],
            scope_access: "read",
            requires_approval: false,
            approval_timeout_hours: 24,
            input_schema: null,
            output_schema: null,
            retry: { max_attempts: 3, backoff: "exponential", backoff_base_seconds: 5, fail_program_on_exhaust: false },
          },
        },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", type: "data_flow", data_mapping: null, condition: null, label: null }],
    });

    const validation = validatePostGenesis(schema, []);
    expect(validation.errors.some((e) => e.code === "ERR_013")).toBe(true);

    const { fixedNodeIds } = applyDeterministicRepairs(schema, validation);
    expect(fixedNodeIds).toContain("n2");
    expect(schema.nodes.find((n) => n.id === "n2")).toBeUndefined();
    expect(schema.edges.find((e) => e.to === "n2")).toBeUndefined();
  });

  it("is a no-op when there are no repairable errors", () => {
    const schema = makeSchema();
    const validation = validatePostGenesis(schema, []);
    const { fixedNodeIds } = applyDeterministicRepairs(schema, validation);
    expect(fixedNodeIds).toEqual([]);
  });
});

describe("collectParamRepairCandidates", () => {
  const connectionNode = (overrides?: Partial<Record<string, unknown>>) => ({
    id: "n2",
    type: "connection" as const,
    label: "Create row",
    description: "",
    position: { x: 300, y: 100 },
    status: "idle" as const,
    connection: "Notion",
    config: {
      connector_type: "oauth" as const,
      provider: "notion",
      operation: "create_database_entry",
      operation_params: { _title: "hi" },
      scope_access: "write" as const,
      scope_required: [],
      ...overrides,
    },
  });

  it("finds a connection node missing a required param", () => {
    const schema = makeSchema({ nodes: [makeSchema().nodes[0]!, connectionNode()] });
    const candidates = collectParamRepairCandidates(schema, [{ name: "Notion", provider: "notion" }]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.missingKeys).toEqual(["database_id"]);
    expect(candidates[0]!.provider).toBe("notion");
    expect(candidates[0]!.operation).toBe("create_database_entry");
  });

  it("skips a node whose required params are already filled", () => {
    const schema = makeSchema({
      nodes: [
        makeSchema().nodes[0]!,
        connectionNode({ database_id: "abc123", operation_params: { database_id: "abc123", _title: "hi" } }),
      ],
    });
    const candidates = collectParamRepairCandidates(schema, [{ name: "Notion", provider: "notion" }]);
    expect(candidates).toHaveLength(0);
  });

  it("skips http and file connector nodes", () => {
    const schema = makeSchema({
      nodes: [
        makeSchema().nodes[0]!,
        {
          id: "n2",
          type: "connection",
          label: "HTTP call",
          description: "",
          position: { x: 300, y: 100 },
          status: "idle",
          connection: null,
          config: {
            connector_type: "http",
            method: "GET",
            url: "https://example.com",
            auth_type: "none",
            auth_value: null,
            query_params: [],
            headers: [],
            body: null,
            parse_response: true,
            timeout_seconds: null,
            retry: null,
          },
        },
      ],
    });
    const candidates = collectParamRepairCandidates(schema, []);
    expect(candidates).toHaveLength(0);
  });
});

describe("buildParamRepairPrompt", () => {
  it("documents the missing keys with type/hint and the task context", () => {
    const schema = makeSchema({ nodes: [makeSchema().nodes[0]!, connectionNodeFixture()] });
    const [candidate] = collectParamRepairCandidates(schema, [{ name: "Notion", provider: "notion" }]);
    const prompt = buildParamRepairPrompt(candidate!, "Log every new lead into the CRM database");

    expect(prompt).toContain("Log every new lead into the CRM database");
    expect(prompt).toContain("notion.create_database_entry");
    expect(prompt).toContain("database_id (string)");
    expect(prompt).toContain("__USER_ASSIGNED__");
  });
});

function connectionNodeFixture() {
  return {
    id: "n2",
    type: "connection" as const,
    label: "Create row",
    description: "",
    position: { x: 300, y: 100 },
    status: "idle" as const,
    connection: "Notion",
    config: {
      connector_type: "oauth" as const,
      provider: "notion",
      operation: "create_database_entry",
      operation_params: { _title: "hi" },
      scope_access: "write" as const,
      scope_required: [],
    },
  };
}

describe("repairMissingOperationParams", () => {
  it("merges resolved values back into the node's operation_params", async () => {
    const schema = makeSchema({ nodes: [makeSchema().nodes[0]!, connectionNodeFixture()] });
    const { repairedNodeIds } = await repairMissingOperationParams(
      schema,
      [{ name: "Notion", provider: "notion" }],
      "Log every new lead into the CRM database",
      async () => JSON.stringify({ database_id: "db-123" })
    );

    expect(repairedNodeIds).toEqual(["n2"]);
    const node = schema.nodes[1]!;
    expect(node.type === "connection" && node.config.connector_type === "oauth" && node.config.operation_params).toEqual({
      _title: "hi",
      database_id: "db-123",
    });
  });

  it("leaves the node untouched when the model returns the unassigned sentinel", async () => {
    const schema = makeSchema({ nodes: [makeSchema().nodes[0]!, connectionNodeFixture()] });
    const { repairedNodeIds } = await repairMissingOperationParams(
      schema,
      [{ name: "Notion", provider: "notion" }],
      "vague task",
      async () => JSON.stringify({ database_id: "__USER_ASSIGNED__" })
    );

    expect(repairedNodeIds).toEqual([]);
    const node = schema.nodes[1]!;
    expect(node.type === "connection" && node.config.connector_type === "oauth" && node.config.operation_params).toEqual({
      _title: "hi",
    });
  });

  it("swallows a model call failure without throwing", async () => {
    const schema = makeSchema({ nodes: [makeSchema().nodes[0]!, connectionNodeFixture()] });
    const { repairedNodeIds } = await repairMissingOperationParams(
      schema,
      [{ name: "Notion", provider: "notion" }],
      "task",
      async () => {
        throw new Error("model unavailable");
      }
    );

    expect(repairedNodeIds).toEqual([]);
  });

  it("swallows malformed JSON from the model without throwing", async () => {
    const schema = makeSchema({ nodes: [makeSchema().nodes[0]!, connectionNodeFixture()] });
    const { repairedNodeIds } = await repairMissingOperationParams(
      schema,
      [{ name: "Notion", provider: "notion" }],
      "task",
      async () => "not json at all"
    );

    expect(repairedNodeIds).toEqual([]);
  });

  it("caps the number of repaired nodes at maxNodes", async () => {
    const nodes = [
      makeSchema().nodes[0]!,
      { ...connectionNodeFixture(), id: "n2" },
      { ...connectionNodeFixture(), id: "n3" },
      { ...connectionNodeFixture(), id: "n4" },
    ];
    const schema = makeSchema({ nodes });
    let calls = 0;
    const { repairedNodeIds } = await repairMissingOperationParams(
      schema,
      [{ name: "Notion", provider: "notion" }],
      "task",
      async () => {
        calls += 1;
        return JSON.stringify({ database_id: "db-123" });
      },
      2
    );

    expect(calls).toBe(2);
    expect(repairedNodeIds).toHaveLength(2);
  });
});
