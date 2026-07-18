import { describe, expect, it } from "vitest";
import type { ProgramSchema } from "@flowos/schema";

import { getAgentModelAccessIssue } from "../agent-model-access";
import { PLATFORM_DEFAULT_MODEL } from "../genesis/platform-models";

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
  it("allows the platform default model on the Free plan", () => {
    // OpenRouter's own free-tier models were dropped platform-wide (they got
    // rate-limited too quickly) — Free plan now runs the same real default
    // model as everyone else, bounded by its small included-credit allowance.
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", PLATFORM_DEFAULT_MODEL), "free")
    ).toBeNull();
  });

  it("migrates both legacy Free defaults to the platform default model", () => {
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "openai/gpt-oss-120b:free"), "free")
    ).toBeNull();
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "openai/gpt-oss-120b"), "free")
    ).toBeNull();
  });

  it("blocks other paid Corelyx models on the Free plan", () => {
    const issue = getAgentModelAccessIssue(
      schemaWithAgent("platform", "openai/gpt-4o"),
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

  it("allows every paid OpenRouter model on Solo and higher", () => {
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "openai/gpt-4o-mini"), "plus")
    ).toBeNull();
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "openai/gpt-4o"), "plus")
    ).toBeNull();
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "vendor/new-model"), "plus")
    ).toBeNull();
  });

  it("allows premium platform models on Team", () => {
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "openai/gpt-4o"), "pro")
    ).toBeNull();
  });

  it("allows future OpenRouter models on Scale", () => {
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "google/gemini-2.5-flash"), "builder")
    ).toBeNull();
  });

  it("puts no model ceiling on the unlimited plan", () => {
    // Mirrors the runtime's _enforce_agent_model_access bypass — regression for
    // the cron runs that failed with "not available ... on the Unlimited plan".
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "google/gemini-2.5-flash"), "unlimited")
    ).toBeNull();
    expect(
      getAgentModelAccessIssue(schemaWithAgent("platform", "vendor/any-future-model"), "unlimited")
    ).toBeNull();
  });
});
