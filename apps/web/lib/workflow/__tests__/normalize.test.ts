import { describe, expect, it } from "vitest";
import { ProgramSchemaZ, RetryConfigZ, StepConfigZ } from "@flowos/schema";
import { normalizeProgramDraft, validateProgramDraft, getDraftValidationMessage } from "../normalize";

const STEP_RETRY = {
  max_attempts: 2,
  backoff: "linear" as const,
  backoff_base_seconds: 10,
  fail_program_on_exhaust: true,
};

function stepConfig(schema: { nodes: { config: unknown }[] }, index = 0) {
  return schema.nodes[index]!.config as Record<string, unknown>;
}

describe("workflow draft normalization", () => {
  it("allows structurally safe drafts that are not executable yet", () => {
    const schema = normalizeProgramDraft({
      program_name: "Draft transform",
      nodes: [
        {
          id: "transform-1",
          type: "step",
          label: "Transform",
          config: { logic_type: "transform", transformation: "" },
        },
      ],
      edges: [],
    });

    expect(validateProgramDraft(schema).success).toBe(true);
    expect(ProgramSchemaZ.safeParse(schema).success).toBe(false);
  });

  it("normalizes AI-style partial nodes and source/target edges into a draft schema", () => {
    const schema = normalizeProgramDraft({
      program_name: "Webhook before transform",
      nodes: [
        {
          id: "webhook-1",
          type: "webhook",
          label: "Webhook",
          config: { trigger_type: "webhook" },
          position: { x: 40, y: 20 },
        },
        {
          id: "transform-1",
          type: "transform",
          label: "Transform",
          config: { transformation: "return input;" },
          position: { x: 40, y: 180 },
        },
      ],
      edges: [{ source: "webhook-1", target: "transform-1" }],
    });

    const result = validateProgramDraft(schema);

    expect(result.success).toBe(true);
    expect(schema.nodes[0]).toMatchObject({
      id: "webhook-1",
      type: "trigger",
      config: { trigger_type: "webhook" },
    });
    expect(schema.nodes[1]).toMatchObject({
      id: "transform-1",
      type: "step",
      config: { logic_type: "transform", transformation: "return input;" },
    });
    expect(schema.edges[0]).toMatchObject({
      from: "webhook-1",
      to: "transform-1",
      type: "data_flow",
    });
    expect(schema.triggers[0]).toMatchObject({ node_id: "webhook-1", type: "webhook" });
  });

  it("rejects drafts whose edges reference missing nodes with an actionable message", () => {
    const schema = normalizeProgramDraft({
      nodes: [{ id: "manual-1", type: "trigger", config: { trigger_type: "manual" } }],
      edges: [{ source: "manual-1", target: "missing-node" }],
    });

    const result = validateProgramDraft(schema);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getDraftValidationMessage(result.error)).toContain("missing target node");
    }
  });

  it("rejects invalid cron expressions before they can be persisted", () => {
    const schema = normalizeProgramDraft({
      nodes: [
        {
          id: "cron-1",
          type: "trigger",
          config: {
            trigger_type: "cron",
            expression: "not a schedule",
            timezone: "UTC",
          },
        },
      ],
      edges: [],
    });

    const result = validateProgramDraft(schema);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getDraftValidationMessage(result.error)).toContain("valid five-field cron expression");
    }
  });

  it("rejects six-field cron expressions that include seconds", () => {
    const schema = normalizeProgramDraft({
      nodes: [
        {
          id: "cron-1",
          type: "trigger",
          config: {
            trigger_type: "cron",
            expression: "0 0 9 * * *",
            timezone: "UTC",
          },
        },
      ],
      edges: [],
    });

    const result = validateProgramDraft(schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getDraftValidationMessage(result.error)).toContain("five-field cron expression");
    }
  });

  it("accepts a valid timezone-aware cron expression", () => {
    const schema = normalizeProgramDraft({
      nodes: [
        {
          id: "cron-1",
          type: "trigger",
          config: {
            trigger_type: "cron",
            expression: "0 9 * * 1-5",
            timezone: "Europe/Vienna",
          },
        },
      ],
      edges: [],
    });

    expect(validateProgramDraft(schema).success).toBe(true);
  });

  it("preserves existing identity fields when normalizing refinement output", () => {
    const existing = normalizeProgramDraft({
      program_id: "existing-program",
      program_name: "Existing program",
      created_at: "2026-01-01T00:00:00.000Z",
      execution_mode: "approval_required",
      metadata: {
        description: "Existing description",
        genesis_timestamp: "2026-01-01T00:00:00.000Z",
      },
      nodes: [{ id: "manual-1", type: "trigger", config: { trigger_type: "manual" } }],
      edges: [],
    });

    const schema = normalizeProgramDraft(
      {
        nodes: [{ id: "manual-1", type: "trigger", config: { trigger_type: "manual" } }],
        edges: [],
      },
      existing
    );

    expect(schema.program_id).toBe("existing-program");
    expect(schema.program_name).toBe("Existing program");
    expect(schema.created_at).toBe("2026-01-01T00:00:00.000Z");
    expect(schema.execution_mode).toBe("approval_required");
    expect(schema.metadata.description).toBe("Existing description");
    expect(schema.metadata.genesis_timestamp).toBe("2026-01-01T00:00:00.000Z");
  });
});

// normalizeStepConfig rebuilds a step's config from its logic-type fields, so
// anything it forgets to copy is dropped on every write path (editor save,
// Genesis, import). It forgot `retry`, which made step retry policies
// unreachable end to end: the request succeeded and stored nothing.
describe("step retry normalization", () => {
  const stepConfigsByLogicType: Record<string, Record<string, unknown>> = {
    transform: { logic_type: "transform", transformation: "return input;" },
    filter: { logic_type: "filter", condition: "input.ok" },
    branch: {
      logic_type: "branch",
      conditions: [{ condition: "input.ok", target_node_id: "n2" }],
      default_branch: "n3",
    },
    delay: { logic_type: "delay", seconds: 30 },
    loop: { logic_type: "loop", over: "input.items", item_var: "item" },
    format: { logic_type: "format", template: "{{ input }}", output_key: "text" },
    parse: { logic_type: "parse", input_key: "text", format: "json" },
    deduplicate: { logic_type: "deduplicate", key: "id" },
    sort: { logic_type: "sort", key: "id", order: "desc" },
  };

  it.each(Object.keys(stepConfigsByLogicType))(
    "keeps a step retry policy through normalization (%s)",
    (logicType) => {
      const schema = normalizeProgramDraft({
        nodes: [
          {
            id: "step-1",
            type: "step",
            label: "Step",
            config: { ...stepConfigsByLogicType[logicType], retry: STEP_RETRY },
          },
        ],
        edges: [],
      });

      expect(stepConfig(schema).retry).toEqual(STEP_RETRY);
      expect(StepConfigZ.safeParse(stepConfig(schema)).success).toBe(true);
    }
  );

  it("leaves an unset step retry absent instead of pinning a default policy", () => {
    const schema = normalizeProgramDraft({
      nodes: [
        {
          id: "step-1",
          type: "step",
          label: "Step",
          config: { logic_type: "transform", transformation: "return input;" },
        },
        {
          id: "step-2",
          type: "step",
          label: "Cleared",
          config: { logic_type: "delay", seconds: 5, retry: null },
        },
      ],
      edges: [],
    });

    // The runtime reads a missing block as `retry: Optional[RetryConfig] = None`
    // and keeps create_retry_policy_for_node's defaults, so materializing one
    // here would silently convert "unset" into a pinned policy on every save.
    expect(stepConfig(schema)).not.toHaveProperty("retry");
    expect(stepConfig(schema, 1)).not.toHaveProperty("retry");
    expect(StepConfigZ.safeParse(stepConfig(schema)).success).toBe(true);
  });

  it("fills a partial step retry block from the defaults, as agent and http configs do", () => {
    const schema = normalizeProgramDraft({
      nodes: [
        {
          id: "step-1",
          type: "step",
          label: "Step",
          config: { logic_type: "transform", transformation: "return input;", retry: { max_attempts: 1 } },
        },
      ],
      edges: [],
    });

    expect(stepConfig(schema).retry).toEqual({
      max_attempts: 1,
      backoff: "exponential",
      backoff_base_seconds: 5,
      fail_program_on_exhaust: false,
    });
  });

  it("survives canonical validation so the retry reaches the runtime payload", () => {
    const schema = normalizeProgramDraft({
      program_name: "Step retry",
      nodes: [
        { id: "manual-1", type: "trigger", label: "Manual", config: { trigger_type: "manual" } },
        {
          id: "step-1",
          type: "step",
          label: "Transform",
          config: { logic_type: "transform", transformation: "return input;", retry: STEP_RETRY },
        },
      ],
      edges: [{ source: "manual-1", target: "step-1" }],
    });

    expect(validateProgramDraft(schema).success).toBe(true);

    const result = ProgramSchemaZ.safeParse(schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes[1]!.config).toMatchObject({ retry: STEP_RETRY });
    }
  });
});

// The runtime caps backoff_base_seconds at 60 (MAX_BACKOFF_BASE_SECONDS) and
// _bounded_float raises instead of clamping, so a larger value validated here
// became an HTTP 500 out of /execute and the run never dispatched.
describe("retry config bounds", () => {
  it("rejects a backoff base above the runtime ceiling", () => {
    expect(RetryConfigZ.safeParse({ ...STEP_RETRY, backoff_base_seconds: 61 }).success).toBe(false);
    expect(RetryConfigZ.safeParse({ ...STEP_RETRY, backoff_base_seconds: 3600 }).success).toBe(false);
  });

  it("accepts the boundary values the runtime accepts", () => {
    expect(RetryConfigZ.safeParse({ ...STEP_RETRY, backoff_base_seconds: 0 }).success).toBe(true);
    expect(RetryConfigZ.safeParse({ ...STEP_RETRY, backoff_base_seconds: 60 }).success).toBe(true);
  });

  it("rejects an out-of-range retry wherever a node config embeds one", () => {
    const overCeiling = { ...STEP_RETRY, backoff_base_seconds: 120 };

    expect(
      StepConfigZ.safeParse({
        logic_type: "delay",
        seconds: 5,
        retry: overCeiling,
      }).success
    ).toBe(false);

    const schema = normalizeProgramDraft({
      nodes: [
        {
          id: "agent-1",
          type: "agent",
          label: "Agent",
          config: { model: "gpt-4o", api_key_ref: "key", retry: overCeiling },
        },
      ],
      edges: [],
    });
    const result = ProgramSchemaZ.safeParse(schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Assert the *reason*, so this can't start passing for an unrelated
      // missing field if the agent config shape changes.
      expect(
        result.error.issues.some((issue) => issue.path.join(".").endsWith("retry.backoff_base_seconds"))
      ).toBe(true);
    }
  });
});
