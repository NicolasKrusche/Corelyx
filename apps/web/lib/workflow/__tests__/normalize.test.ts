import { describe, expect, it } from "vitest";
import { ProgramSchemaZ } from "@flowos/schema";
import { normalizeProgramDraft, validateProgramDraft, getDraftValidationMessage } from "../normalize";

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
