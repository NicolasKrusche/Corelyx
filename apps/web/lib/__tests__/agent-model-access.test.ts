import { describe, expect, it } from "vitest";
import type { ProgramSchema } from "@flowos/schema";

import { getAgentModelAccessIssue } from "../agent-model-access";

function schemaWithAgent(apiKeyRef: string, model: string): ProgramSchema {
  return {
    program_id: "00000000-0000-4000-8000-000000000001",
    program_name: "Model access test",
    program_type: "workflow",
    description: "Model access test",
    version: "1.0.0",
    execution_mode: "autonomous",
    conflict_policy: "queue",
    nodes: [
      {
        id: "agent-1",
        type: "agent",
        label: "Draft reply",
        description: "Draft a reply",
        position: { x: 0, y: 0 },
        connection: null,
        config: {
          api_key_ref: apiKeyRef,
          model,
          system_prompt: "Draft a reply",
          input_schema: null,
          output_schema: null,
          requires_approval: false,
          approval_timeout_hours: 24,
          scope_required: null,
          scope_access: "read",
          retry: {
            max_attempts: 1,
            backoff: "fixed",
            backoff_base_seconds: 1,
            fail_program_on_exhaust: true,
          },
          tools: [],
        },
      },
    ],
    edges: [],
    triggers: [],
    variables: [],
    metadata: {
      created_by: "test",
      created_at: "2026-07-17T00:00:00.000Z",
      updated_at: "2026-07-17T00:00:00.000Z",
      tags: [],
      category: "test",
      genesis_model: "manual",
    },
    version_history: [],
  } as unknown as ProgramSchema;
}

describe("Agent model plan access", () => {
  it("allows the free Corelyx platform model on the Free plan", () => {
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "openai/gpt-oss-120b"), "free")
    ).toBeNull();
  });

  it("accepts the legacy free platform alias", () => {
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "openai/gpt-oss-120b:free"), "free")
    ).toBeNull();
  });

  it("blocks paid Corelyx models on the Free plan", () => {
    const issue = getAgentModelAccessIssue(
      schemaWithAgent("platform", "openai/gpt-4o-mini"),
      "free"
    );
    expect(issue?.code).toBe("PLATFORM_MODEL_PLAN_REQUIRED");
  });

  it("blocks personal keys on the Free plan", () => {
    const issue = getAgentModelAccessIssue(
      schemaWithAgent("00000000-0000-4000-8000-000000000099", "openai/gpt-4o"),
      "free"
    );
    expect(issue?.code).toBe("BYOK_PLAN_REQUIRED");
  });

  it("allows standard platform models on Solo but not premium models", () => {
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "openai/gpt-4o-mini"), "plus")
    ).toBeNull();
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "openai/gpt-4o"), "plus")?.code
    ).toBe("PLATFORM_MODEL_PLAN_REQUIRED");
  });

  it("allows premium platform models on Team", () => {
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "openai/gpt-4o"), "pro")
    ).toBeNull();
  });
});
