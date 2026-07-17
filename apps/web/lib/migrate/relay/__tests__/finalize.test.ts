import { describe, expect, it } from "vitest";
import {
  finalizeConvertedSchema,
  isRelayMigration,
  parseConvertedSchema,
  RELAY_MIGRATION_TAG,
  RelayConversionError,
} from "@/lib/migrate/relay/finalize";

// A minimal converted workflow the model might emit: cron trigger → agent.
function modelOutput(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    program_name: "Weekday invoice digest",
    execution_mode: "autonomous",
    nodes: [
      {
        id: "t1",
        type: "trigger",
        label: "Every weekday 7am",
        config: { trigger_type: "cron", expression: "0 7 * * 1-5", timezone: "Europe/Berlin" },
      },
      {
        id: "a1",
        type: "agent",
        label: "Classify",
        config: { system_prompt: "Classify the email." },
      },
    ],
    edges: [{ id: "e1", from: "t1", to: "a1", type: "data_flow" }],
    metadata: { description: "Digest" },
    ...overrides,
  });
}

describe("parseConvertedSchema", () => {
  it("parses plain JSON", () => {
    expect(parseConvertedSchema('{"program_name":"x"}')).toMatchObject({ program_name: "x" });
  });

  it("strips markdown fences and surrounding prose", () => {
    const wrapped = "Here you go:\n```json\n{\"program_name\":\"x\"}\n```\nHope that helps!";
    expect(parseConvertedSchema(wrapped)).toMatchObject({ program_name: "x" });
  });

  it("repairs minor structural slips (trailing comma)", () => {
    expect(parseConvertedSchema('{"a":1,}')).toMatchObject({ a: 1 });
  });

  it("throws RelayConversionError on unusable output", () => {
    expect(() => parseConvertedSchema("the model refused")).toThrow(RelayConversionError);
  });
});

describe("finalizeConvertedSchema", () => {
  it("produces a valid draft from a well-formed conversion", () => {
    const result = finalizeConvertedSchema(parseConvertedSchema(modelOutput()));
    expect(result.draftValid).toBe(true);
    expect(result.schema.program_name).toBe("Weekday invoice digest");
    expect(result.schema.nodes).toHaveLength(2);
  });

  it("always lands inactive, even if the model set is_active true", () => {
    const result = finalizeConvertedSchema(
      parseConvertedSchema(modelOutput({ metadata: { description: "d", is_active: true } }))
    );
    expect(result.schema.metadata.is_active).toBe(false);
  });

  it("tags the program as a relay migration", () => {
    const result = finalizeConvertedSchema(parseConvertedSchema(modelOutput()));
    expect(result.schema.metadata.tags).toContain(RELAY_MIGRATION_TAG);
    expect(isRelayMigration(result.schema)).toBe(true);
  });

  it("normalizes a foreign node type (action → connection)", () => {
    const output = JSON.stringify({
      program_name: "One step",
      execution_mode: "autonomous",
      nodes: [
        {
          id: "c1",
          type: "action",
          label: "Send Slack",
          connection: "Slack",
          config: { provider: "slack", operation: "send_message" },
        },
      ],
      edges: [],
      metadata: { description: "d" },
    });
    const result = finalizeConvertedSchema(parseConvertedSchema(output));
    expect(result.schema.nodes[0]!.type).toBe("connection");
  });

  it("prunes a dangling edge instead of failing the whole conversion", () => {
    const output = JSON.stringify({
      program_name: "Dangler",
      execution_mode: "autonomous",
      nodes: [{ id: "t1", type: "trigger", config: { trigger_type: "manual" } }],
      edges: [{ id: "e1", from: "t1", to: "ghost", type: "data_flow" }],
      metadata: { description: "d" },
    });
    const result = finalizeConvertedSchema(parseConvertedSchema(output));
    expect(result.removed.edges).toBe(1);
    expect(result.draftValid).toBe(true);
  });

  it("uses the fallback name when the model omitted program_name", () => {
    const output = JSON.stringify({
      execution_mode: "autonomous",
      nodes: [{ id: "t1", type: "trigger", config: { trigger_type: "manual" } }],
      edges: [],
      metadata: { description: "d" },
    });
    const result = finalizeConvertedSchema(parseConvertedSchema(output), { fallbackName: "From Zip Folder" });
    expect(result.schema.program_name).toBe("From Zip Folder");
  });

  it("reports draftValid:false with an error for an invalid cron", () => {
    const result = finalizeConvertedSchema(
      parseConvertedSchema(
        modelOutput({
          nodes: [
            { id: "t1", type: "trigger", config: { trigger_type: "cron", expression: "not a cron", timezone: "UTC" } },
          ],
          edges: [],
        })
      )
    );
    expect(result.draftValid).toBe(false);
    expect(result.draftError).toBeDefined();
  });
});
