import { describe, expect, it } from "vitest";

import {
  buildDeterministicDecisionLog,
  generateDecisionLog,
  heuristicConfidence,
  mergeModelReasoning,
  parseStoredDecisionLog,
  DecisionLogZ,
  DETERMINISTIC_MODEL,
} from "../decision-log";
import type { Node, ProgramSchema, Edge } from "@flowos/schema";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function schemaOf(nodes: Node[], edges: Edge[] = []): ProgramSchema {
  return {
    version: "1.0",
    program_id: "p1",
    program_name: "Daily digest",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    execution_mode: "autonomous",
    nodes,
    edges,
    triggers: [],
    version_history: [],
    metadata: {
      description: "",
      genesis_model: "test",
      genesis_timestamp: "2026-01-01T00:00:00Z",
      tags: [],
      is_active: false,
    },
  } as unknown as ProgramSchema;
}

const AT = "2026-07-23T00:00:00Z";

const cronTrigger: Node = {
  id: "n1",
  type: "trigger",
  label: "Every morning",
  description: "",
  position: { x: 0, y: 0 },
  config: { trigger_type: "cron", expression: "0 9 * * 1-5", timezone: "UTC" },
} as unknown as Node;

const slackNode: Node = {
  id: "n2",
  type: "connection",
  label: "Post to Slack",
  description: "",
  position: { x: 0, y: 0 },
  connection: "slack",
  config: { connector_type: "oauth", provider: "slack", operation: "send_message", scope_access: "write" },
} as unknown as Node;

const httpNode: Node = {
  id: "n3",
  type: "connection",
  label: "Call API",
  description: "",
  position: { x: 0, y: 0 },
  config: { connector_type: "http", method: "POST", url: "https://api.example.com/x" },
} as unknown as Node;

const noteNode: Node = {
  id: "n4",
  type: "note",
  label: "Reminder",
  description: "",
  position: { x: 0, y: 0 },
  config: {},
} as unknown as Node;

// ─── Deterministic build ──────────────────────────────────────────────────────

describe("buildDeterministicDecisionLog", () => {
  it("produces one entry per decision node and excludes notes/groups", () => {
    const schema = schemaOf([cronTrigger, slackNode, noteNode]);
    const log = buildDeterministicDecisionLog(schema, AT);

    expect(log.version).toBe(1);
    expect(log.model).toBe(DETERMINISTIC_MODEL);
    expect(log.generated_at).toBe(AT);
    expect(log.entries).toHaveLength(2);
    expect(log.entries.map((e) => e.node_id)).toEqual(["n1", "n2"]);
    expect(log.summary).toContain("Daily digest");
  });

  it("fills step/reasoning/confidence for each entry", () => {
    const log = buildDeterministicDecisionLog(schemaOf([cronTrigger, slackNode]), AT);
    const slack = log.entries.find((e) => e.node_id === "n2")!;
    expect(slack.step.length).toBeGreaterThan(0);
    expect(slack.reasoning.length).toBeGreaterThan(0);
    expect(slack.confidence).toBeGreaterThan(0);
    expect(slack.confidence).toBeLessThanOrEqual(1);
  });

  it("offers connector alternatives for OAuth nodes", () => {
    const log = buildDeterministicDecisionLog(schemaOf([slackNode]), AT);
    expect(log.entries[0]!.alternatives_considered.length).toBeGreaterThan(0);
  });

  it("validates against DecisionLogZ", () => {
    const log = buildDeterministicDecisionLog(schemaOf([cronTrigger, slackNode, httpNode]), AT);
    expect(DecisionLogZ.safeParse(log).success).toBe(true);
  });
});

describe("heuristicConfidence", () => {
  it("scores mechanical mappings higher than open-ended ones", () => {
    expect(heuristicConfidence(cronTrigger)).toBeGreaterThan(heuristicConfidence(httpNode));
    expect(heuristicConfidence(slackNode)).toBeGreaterThan(heuristicConfidence(httpNode));
  });
});

// ─── Merge ────────────────────────────────────────────────────────────────────

describe("mergeModelReasoning", () => {
  it("overrides matched nodes and keeps unmatched ones", () => {
    const base = buildDeterministicDecisionLog(schemaOf([cronTrigger, slackNode]), AT);
    const merged = mergeModelReasoning(base, "claude-x", {
      summary: "Because you asked for a weekday Slack digest.",
      nodes: [{ node_id: "n2", reasoning: "Chosen because Slack is your team channel.", confidence: 0.95 }],
    });

    expect(merged.model).toBe("claude-x");
    expect(merged.summary).toContain("weekday Slack digest");
    const slack = merged.entries.find((e) => e.node_id === "n2")!;
    expect(slack.reasoning).toBe("Chosen because Slack is your team channel.");
    expect(slack.confidence).toBe(0.95);
    // Untouched node keeps deterministic reasoning.
    const trigger = merged.entries.find((e) => e.node_id === "n1")!;
    expect(trigger.reasoning).toBe(base.entries.find((e) => e.node_id === "n1")!.reasoning);
  });

  it("clamps out-of-range model confidence", () => {
    const base = buildDeterministicDecisionLog(schemaOf([slackNode]), AT);
    const merged = mergeModelReasoning(base, "m", { nodes: [{ node_id: "n2", confidence: 4.2 }] });
    expect(merged.entries[0]!.confidence).toBe(1);
  });
});

// ─── generateDecisionLog (enrichment orchestration) ───────────────────────────

describe("generateDecisionLog", () => {
  it("returns the deterministic log when no model caller is supplied", async () => {
    const log = await generateDecisionLog({
      schema: schemaOf([cronTrigger, slackNode]),
      description: "Send a weekday digest to Slack",
      generatedAt: AT,
    });
    expect(log.model).toBe(DETERMINISTIC_MODEL);
    expect(log.entries).toHaveLength(2);
  });

  it("enriches with model reasoning when the caller returns valid JSON", async () => {
    const log = await generateDecisionLog({
      schema: schemaOf([cronTrigger, slackNode]),
      description: "Send a weekday digest to Slack",
      generatedAt: AT,
      model: "claude-x",
      callModel: async () =>
        JSON.stringify({
          summary: "A weekday Slack digest.",
          nodes: [{ node_id: "n2", reasoning: "Slack is your primary channel.", confidence: 0.9 }],
        }),
    });
    expect(log.model).toBe("claude-x");
    expect(log.entries.find((e) => e.node_id === "n2")!.reasoning).toBe("Slack is your primary channel.");
  });

  it("falls back to deterministic when the model returns garbage", async () => {
    const log = await generateDecisionLog({
      schema: schemaOf([slackNode]),
      description: "x",
      generatedAt: AT,
      model: "claude-x",
      callModel: async () => "not json at all",
    });
    expect(log.model).toBe(DETERMINISTIC_MODEL);
  });

  it("falls back to deterministic when the model throws", async () => {
    const log = await generateDecisionLog({
      schema: schemaOf([slackNode]),
      description: "x",
      generatedAt: AT,
      model: "claude-x",
      callModel: async () => {
        throw new Error("boom");
      },
    });
    expect(log.model).toBe(DETERMINISTIC_MODEL);
  });
});

describe("parseStoredDecisionLog", () => {
  it("round-trips a valid log and rejects junk", () => {
    const log = buildDeterministicDecisionLog(schemaOf([slackNode]), AT);
    expect(parseStoredDecisionLog(log)).not.toBeNull();
    expect(parseStoredDecisionLog({ foo: 1 })).toBeNull();
    expect(parseStoredDecisionLog(null)).toBeNull();
  });
});
