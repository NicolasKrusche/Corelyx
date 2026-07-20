import { describe, expect, it } from "vitest";
import {
  schemaTriggerNodeId,
  withAllSchemaTriggersPaused,
  withSchemaTriggerActiveState,
} from "@/lib/triggers/schema-trigger-state";

const schema = {
  updated_at: "old",
  nodes: [
    { id: "trigger-1", type: "trigger", config: { trigger_type: "cron", expression: "0 9 * * *" } },
  ],
  triggers: [
    { node_id: "trigger-1", type: "cron", is_active: true, last_fired: null, next_scheduled: "future" },
  ],
};

describe("schema trigger state", () => {
  it("recognizes schema-owned trigger rows", () => {
    expect(schemaTriggerNodeId({ node_id: " trigger-1 " })).toBe("trigger-1");
    expect(schemaTriggerNodeId({})).toBeNull();
  });

  it("persists pause state without mutating the original schema", () => {
    const updated = withSchemaTriggerActiveState(
      schema,
      "trigger-1",
      false,
      null,
      "2026-07-11T12:00:00.000Z"
    );

    expect(updated?.triggers).toEqual([
      expect.objectContaining({ node_id: "trigger-1", type: "cron", is_active: false, next_scheduled: null }),
    ]);
    expect(updated?.updated_at).toBe("2026-07-11T12:00:00.000Z");
    expect(schema.triggers[0]?.is_active).toBe(true);
  });

  it("adds a missing trigger-state entry for an existing node", () => {
    const updated = withSchemaTriggerActiveState(
      { ...schema, triggers: [] },
      "trigger-1",
      true,
      "2026-07-12T09:00:00.000Z"
    );
    expect(updated?.triggers).toEqual([
      expect.objectContaining({
        node_id: "trigger-1",
        type: "cron",
        is_active: true,
        next_scheduled: "2026-07-12T09:00:00.000Z",
      }),
    ]);
  });

  it("refuses to create state for a missing workflow node", () => {
    expect(withSchemaTriggerActiveState(schema, "missing", false, null)).toBeNull();
    expect(withSchemaTriggerActiveState(
      { ...schema, nodes: [{ id: "trigger-1", type: "action", config: {} }] },
      "trigger-1",
      false,
      null
    )).toBeNull();
  });

  it("pauses every trigger when copying a workflow", () => {
    const source = {
      ...schema,
      metadata: { is_active: true, description: "Published source" },
      triggers: [
        schema.triggers[0],
        { node_id: "trigger-2", type: "webhook", is_active: true, next_scheduled: null },
      ],
    };

    const paused = withAllSchemaTriggersPaused(source, "2026-07-20T16:00:00.000Z");

    expect(paused.updated_at).toBe("2026-07-20T16:00:00.000Z");
    expect(paused.metadata).toEqual({ is_active: false, description: "Published source" });
    expect(paused.triggers).toEqual([
      { ...schema.triggers[0], is_active: false, next_scheduled: null },
      { node_id: "trigger-2", type: "webhook", is_active: false, next_scheduled: null },
    ]);
    expect(source.triggers[0]?.is_active).toBe(true);
  });
});
