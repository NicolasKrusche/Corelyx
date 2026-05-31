import { describe, expect, it } from "vitest";
import {
  desiredEventTriggersFromSchema,
  planEventTriggerSync,
  type ExistingEventTriggerRow,
} from "@/lib/triggers/event-trigger-sync";

const gmailSchema = {
  nodes: [
    {
      id: "trigger-node-1",
      type: "trigger",
      config: { trigger_type: "event", source: "gmail", event: "new_email", filter: null },
    },
    { id: "agent-1", type: "agent", config: {} },
  ],
  triggers: [{ node_id: "trigger-node-1", type: "event", is_active: true }],
};

describe("desiredEventTriggersFromSchema", () => {
  it("derives an event trigger row from a Gmail trigger node", () => {
    const desired = desiredEventTriggersFromSchema(gmailSchema);
    expect(desired).toEqual([
      {
        node_id: "trigger-node-1",
        config: {
          trigger_type: "event",
          source: "gmail",
          event: "new_email",
          filter: null,
          node_id: "trigger-node-1",
        },
        is_active: true,
      },
    ]);
  });

  it("ignores non-event trigger nodes and respects a paused trigger", () => {
    const schema = {
      nodes: [
        { id: "t1", type: "trigger", config: { trigger_type: "cron", expression: "0 9 * * *" } },
        { id: "t2", type: "trigger", config: { trigger_type: "event", source: "slack", event: "message" } },
      ],
      triggers: [{ node_id: "t2", type: "event", is_active: false }],
    };
    const desired = desiredEventTriggersFromSchema(schema);
    expect(desired).toHaveLength(1);
    expect(desired[0]?.is_active).toBe(false);
    expect(desired[0]?.config.source).toBe("slack");
  });
});

describe("planEventTriggerSync", () => {
  it("inserts a brand-new Gmail event trigger", () => {
    const plan = planEventTriggerSync(gmailSchema, []);
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toDelete).toHaveLength(0);
  });

  it("is a no-op when the table already matches the schema", () => {
    const existing: ExistingEventTriggerRow[] = [
      {
        id: "row-1",
        is_active: true,
        config: {
          trigger_type: "event",
          source: "gmail",
          event: "new_email",
          filter: null,
          node_id: "trigger-node-1",
        },
      },
    ];
    const plan = planEventTriggerSync(gmailSchema, existing);
    expect(plan).toEqual({ toInsert: [], toUpdate: [], toDelete: [] });
  });

  it("updates a row when the node config changed", () => {
    const existing: ExistingEventTriggerRow[] = [
      {
        id: "row-1",
        is_active: true,
        config: { trigger_type: "event", source: "gmail", event: "old_event", filter: null, node_id: "trigger-node-1" },
      },
    ];
    const plan = planEventTriggerSync(gmailSchema, existing);
    expect(plan.toUpdate).toEqual([
      {
        id: "row-1",
        is_active: true,
        config: {
          trigger_type: "event",
          source: "gmail",
          event: "new_email",
          filter: null,
          node_id: "trigger-node-1",
        },
      },
    ]);
  });

  it("deletes owned rows whose node was removed but leaves unowned rows alone", () => {
    const existing: ExistingEventTriggerRow[] = [
      // Owned by a node that no longer exists in the schema → delete.
      { id: "row-removed", is_active: true, config: { trigger_type: "event", source: "gmail", event: "new_email", node_id: "ghost-node" } },
      // Created some other way (no node_id) → must be left untouched.
      { id: "row-manual", is_active: true, config: { trigger_type: "event" } },
    ];
    const plan = planEventTriggerSync(gmailSchema, existing);
    expect(plan.toDelete).toEqual(["row-removed"]);
    expect(plan.toInsert).toHaveLength(1); // the gmail node still needs creating
  });
});
