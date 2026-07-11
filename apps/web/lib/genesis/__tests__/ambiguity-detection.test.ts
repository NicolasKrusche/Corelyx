import { describe, expect, it } from "vitest";
import type { CapabilityDescriptor } from "../introspection";
import {
  buildAmbiguityClarification,
  countCandidatesByCategory,
  findAmbiguousTargets,
} from "../ambiguity-detection";

const twoSlackChannels: CapabilityDescriptor[] = [
  {
    provider: "slack",
    connection_id: "c-slack",
    resources: [
      { kind: "channel", name: "general", user_named: true },
      { kind: "channel", name: "eng-team", user_named: true },
    ],
  },
];

const oneNotionDatabase: CapabilityDescriptor[] = [
  {
    provider: "notion",
    connection_id: "c-notion",
    resources: [{ kind: "database", name: "CRM Leads", user_named: true }],
  },
];

function connectionNode(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "n2",
    type: "connection",
    label: "Post Summary to Slack",
    config: {
      connector_type: "oauth",
      provider: "slack",
      operation: "send_message",
      operation_params: { channel: "[SLACK_CHANNEL_2]", text: "hi" },
      scope_access: "write",
      scope_required: [],
    },
    ...overrides,
  };
}

describe("countCandidatesByCategory", () => {
  it("counts resources per provider+kind category", () => {
    const counts = countCandidatesByCategory(twoSlackChannels);
    expect(counts.get("SLACK_CHANNEL")).toBe(2);
  });

  it("combines counts across multiple connections of the same provider", () => {
    const descriptors: CapabilityDescriptor[] = [
      { provider: "slack", connection_id: "c1", resources: [{ kind: "channel", name: "general", user_named: true }] },
      { provider: "slack", connection_id: "c2", resources: [{ kind: "channel", name: "random", user_named: true }] },
    ];
    expect(countCandidatesByCategory(descriptors).get("SLACK_CHANNEL")).toBe(2);
  });

  it("returns an empty map for no descriptors", () => {
    expect(countCandidatesByCategory([]).size).toBe(0);
  });

  it("keeps distinct kinds within the same provider separate", () => {
    const descriptors: CapabilityDescriptor[] = [
      {
        provider: "notion",
        connection_id: "c1",
        resources: [
          { kind: "database", name: "CRM", user_named: true },
          { kind: "page", name: "Roadmap", user_named: true },
        ],
      },
    ];
    const counts = countCandidatesByCategory(descriptors);
    expect(counts.get("NOTION_DATABASE")).toBe(1);
    expect(counts.get("NOTION_PAGE")).toBe(1);
  });
});

describe("findAmbiguousTargets", () => {
  it("flags a write-scoped node targeting an ambiguous (2+ candidate) category", () => {
    const schema = { nodes: [connectionNode()] };
    const targets = findAmbiguousTargets(schema, twoSlackChannels);
    expect(targets).toEqual([
      { nodeId: "n2", nodeLabel: "Post Summary to Slack", category: "SLACK_CHANNEL", candidateCount: 2 },
    ]);
  });

  it("does not flag a read-scoped node", () => {
    const schema = {
      nodes: [connectionNode({ config: { ...connectionNode().config, scope_access: "read" } })],
    };
    expect(findAmbiguousTargets(schema, twoSlackChannels)).toEqual([]);
  });

  it("does not flag when only one real candidate exists (no genuine ambiguity)", () => {
    const schema = {
      nodes: [
        connectionNode({
          config: {
            connector_type: "oauth",
            provider: "notion",
            operation: "create_database_entry",
            operation_params: { database_id: "[NOTION_DATABASE_1]" },
            scope_access: "write",
            scope_required: [],
          },
        }),
      ],
    };
    expect(findAmbiguousTargets(schema, oneNotionDatabase)).toEqual([]);
  });

  it("ignores non-connection nodes", () => {
    const schema = {
      nodes: [
        { id: "n1", type: "step", label: "Filter", config: { logic_type: "filter", condition: "True" } },
      ],
    };
    expect(findAmbiguousTargets(schema, twoSlackChannels)).toEqual([]);
  });

  it("flags at most once per node even with multiple ambiguous references", () => {
    const schema = {
      nodes: [
        connectionNode({
          config: {
            ...connectionNode().config,
            operation_params: { channel: "[SLACK_CHANNEL_1]", backup_channel: "[SLACK_CHANNEL_2]" },
          },
        }),
      ],
    };
    expect(findAmbiguousTargets(schema, twoSlackChannels)).toHaveLength(1);
  });

  it("returns nothing when there is no capability data at all", () => {
    const schema = { nodes: [connectionNode()] };
    expect(findAmbiguousTargets(schema, [])).toEqual([]);
  });

  it("handles malformed schema input gracefully", () => {
    expect(findAmbiguousTargets(null, twoSlackChannels)).toEqual([]);
    expect(findAmbiguousTargets({}, twoSlackChannels)).toEqual([]);
    expect(findAmbiguousTargets({ nodes: "not an array" }, twoSlackChannels)).toEqual([]);
  });

  it("falls back to the node id when label is missing", () => {
    const schema = { nodes: [connectionNode({ label: undefined })] };
    expect(findAmbiguousTargets(schema, twoSlackChannels)[0]!.nodeLabel).toBe("n2");
  });
});

describe("buildAmbiguityClarification", () => {
  it("builds a readable, well-formed clarification with no blocked nodes", () => {
    const clarification = buildAmbiguityClarification({
      nodeId: "n2",
      nodeLabel: "Post Summary to Slack",
      category: "SLACK_CHANNEL",
      candidateCount: 3,
    });
    expect(clarification.node_id).toBe("n2");
    expect(clarification.question).toContain("Post Summary to Slack");
    expect(clarification.question).toContain("3");
    expect(clarification.question).toContain("Slack channel");
    expect(clarification.blocked_node_ids).toEqual([]);
  });

  it("formats multi-word categories readably", () => {
    const clarification = buildAmbiguityClarification({
      nodeId: "n3",
      nodeLabel: "Update CRM",
      category: "HUBSPOT_CONTACT_LIST",
      candidateCount: 2,
    });
    expect(clarification.question).toContain("Hubspot contact list");
  });
});
