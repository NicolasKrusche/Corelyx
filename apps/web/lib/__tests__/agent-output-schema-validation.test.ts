import { describe, expect, it } from "vitest";
import { validatePostGenesis } from "../validation";
import type { ProgramSchema } from "@flowos/schema";

/* WARN_005 — regression guard for a silent, end-to-end failure.
 *
 * Reproduces prg fe585750 ("Weekday Morning Gmail Digest to Slack"): Genesis
 * emitted an agent with output_schema:null, a filter reading
 * data['n6'].get('is_important'), and a Notion node reading {{n6.summary}}.
 * The agent answered in prose, the runtime stored {"text": "..."}, the filter
 * dropped all 25 emails, Slack and Notion were skipped — and the run reported
 * "completed". Nothing errored, so nothing surfaced. */

function agent(outputSchema: unknown) {
  return {
    id: "n6",
    type: "agent",
    label: "Assess email importance",
    position: { x: 0, y: 0 },
    connection: null,
    config: {
      model: "google/gemini-2.5-flash",
      api_key_ref: "platform",
      system_prompt: "Decide whether the email is important.",
      input_schema: null,
      output_schema: outputSchema,
      requires_approval: false,
      approval_timeout_hours: 24,
      scope_required: null,
      scope_access: "read",
      retry: { max_attempts: 3, backoff: "exponential", backoff_base_seconds: 5, fail_program_on_exhaust: false },
      tools: [],
    },
  };
}

function schemaWith(outputSchema: unknown, extraNodes: unknown[] = []): ProgramSchema {
  return {
    program_name: "Weekday Morning Gmail Digest to Slack",
    execution_mode: "autonomous",
    triggers: [{ node_id: "n1", type: "cron", is_active: true, last_fired: null, next_scheduled: null }],
    nodes: [
      { id: "n1", type: "trigger", label: "Every weekday 07:00", position: { x: 0, y: 0 }, connection: null,
        config: { trigger_type: "cron", expression: "0 7 * * 1-5", timezone: "UTC" } },
      agent(outputSchema),
      { id: "n7", type: "step", label: "Filter important only", position: { x: 0, y: 0 }, connection: null,
        config: { logic_type: "filter", condition: "data['n6'].get('is_important', False) == True", pass_schema: null } },
      ...extraNodes,
    ],
    edges: [
      { id: "e1", from: "n1", to: "n6", type: "data_flow", data_mapping: null },
      { id: "e2", from: "n6", to: "n7", type: "data_flow", data_mapping: null },
    ],
  } as unknown as ProgramSchema;
}

const notionNode = {
  id: "n10", type: "connection", label: "Save summary to Notion",
  position: { x: 0, y: 0 }, connection: null,
  config: { provider: "notion", operation: "create_database_entry", scope_access: "write",
            operation_params: { _body: "{{n6.summary}}", _title: "{{n5.subject}}" } },
};

function warn005(schema: ProgramSchema) {
  return validatePostGenesis(schema, []).warnings.filter((w) => w.code === "WARN_005");
}

describe("WARN_005: agent fields read downstream but never declared", () => {
  it("flags the shipped bug — a filter reads is_important from an agent with no output_schema", () => {
    const found = warn005(schemaWith(null));
    expect(found).toHaveLength(1);
    expect(found[0]!.node_id).toBe("n6");
    expect(found[0]!.message).toContain("is_important");
  });

  it("also catches {{n6.summary}} in connector params, not just filter conditions", () => {
    const found = warn005(schemaWith(null, [notionNode]));
    expect(found[0]!.message).toContain("is_important");
    expect(found[0]!.message).toContain("summary");
  });

  it("stays quiet once the agent declares both fields", () => {
    const declared = {
      type: "object",
      properties: { is_important: { type: "boolean" }, summary: { type: "string" } },
      required: ["is_important", "summary"],
    };
    expect(warn005(schemaWith(declared, [notionNode]))).toHaveLength(0);
  });

  it("flags a partial schema — declaring is_important but not the summary Notion reads", () => {
    const partial = {
      type: "object",
      properties: { is_important: { type: "boolean" } },
      required: ["is_important"],
    };
    const found = warn005(schemaWith(partial, [notionNode]));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("summary");
    expect(found[0]!.message).not.toContain("is_important");
  });

  it("stays quiet when nothing reads the agent's output", () => {
    const lonely = {
      program_name: "x", execution_mode: "autonomous",
      triggers: [{ node_id: "n1", type: "manual", is_active: true, last_fired: null, next_scheduled: null }],
      nodes: [
        { id: "n1", type: "trigger", label: "Go", position: { x: 0, y: 0 }, connection: null, config: { trigger_type: "manual" } },
        agent(null),
      ],
      edges: [{ id: "e1", from: "n1", to: "n6", type: "data_flow", data_mapping: null }],
    } as unknown as ProgramSchema;
    expect(warn005(lonely)).toHaveLength(0);
  });

  it("does not flag reads aimed at a different node", () => {
    const other = schemaWith(null);
    // Point the filter at a step node instead; n6 is then unreferenced.
    (other.nodes as unknown as Array<{ id: string; config: Record<string, unknown> }>)
      .find((n) => n.id === "n7")!.config.condition = "data['n5'].get('subject', '') != ''";
    expect(warn005(other)).toHaveLength(0);
  });
});
