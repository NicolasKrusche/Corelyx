import { describe, expect, it } from "vitest";
import {
  desiredEventTriggersFromSchema,
  desiredWebhookTriggersFromSchema,
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

  it("is a no-op when the stored config has jsonb-canonicalized key order", () => {
    // Postgres jsonb does not preserve key order — it stores keys sorted by
    // length, then bytewise. A row read back from the DB therefore has a
    // different key order than the freshly built desired config. This used to
    // false-negative the equality check and rewrite every row on every sync
    // (and re-base next_run_at for cron rows, silently eating due fires).
    const jsonbOrderedConfig = JSON.parse(
      // Key order as Postgres jsonb would serialize it: shortest key first.
      `{"event":"new_email","filter":null,"source":"gmail","node_id":"trigger-node-1","trigger_type":"event"}`
    );
    const existing: ExistingEventTriggerRow[] = [
      { id: "row-1", is_active: true, config: jsonbOrderedConfig },
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

  it("treats nested filter objects as equal regardless of key order", () => {
    const schema = {
      nodes: [
        {
          id: "t1",
          type: "trigger",
          config: {
            trigger_type: "event",
            source: "gmail",
            event: "new_email",
            filter: { from: "boss@example.com", subject_contains: "urgent" },
          },
        },
      ],
      triggers: [],
    };
    const existing: ExistingEventTriggerRow[] = [
      {
        id: "row-1",
        is_active: true,
        config: JSON.parse(
          `{"event":"new_email","filter":{"from":"boss@example.com","subject_contains":"urgent"},"source":"gmail","node_id":"t1","trigger_type":"event"}`
        ),
      },
    ];
    const plan = planEventTriggerSync(schema, existing);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toInsert).toHaveLength(0);
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

describe("desiredWebhookTriggersFromSchema", () => {
  it("derives a webhook trigger row from a webhook trigger node", () => {
    const schema = {
      nodes: [
        {
          id: "hook-1",
          type: "trigger",
          config: { trigger_type: "webhook", endpoint_id: "ep-123", method: "POST" },
        },
        { id: "step-1", type: "step", config: {} },
      ],
      triggers: [{ node_id: "hook-1", type: "webhook", is_active: true }],
    };
    expect(desiredWebhookTriggersFromSchema(schema)).toEqual([
      {
        node_id: "hook-1",
        config: {
          trigger_type: "webhook",
          method: "POST",
          endpoint_id: "ep-123",
          node_id: "hook-1",
        },
        is_active: true,
      },
    ]);
  });

  it("defaults method to POST, omits empty endpoint_id, and respects a paused state", () => {
    const schema = {
      nodes: [
        { id: "hook-1", type: "trigger", config: { trigger_type: "webhook", endpoint_id: "" } },
        { id: "t2", type: "trigger", config: { trigger_type: "cron", expression: "0 9 * * *" } },
      ],
      triggers: [{ node_id: "hook-1", type: "webhook", is_active: false }],
    };
    const desired = desiredWebhookTriggersFromSchema(schema);
    expect(desired).toHaveLength(1);
    expect(desired[0]).toEqual({
      node_id: "hook-1",
      config: { trigger_type: "webhook", method: "POST", node_id: "hook-1" },
      is_active: false,
    });
  });

  it("returns nothing for schemas without webhook trigger nodes", () => {
    expect(desiredWebhookTriggersFromSchema({ nodes: [], triggers: [] })).toEqual([]);
    expect(desiredWebhookTriggersFromSchema(null)).toEqual([]);
  });
});
