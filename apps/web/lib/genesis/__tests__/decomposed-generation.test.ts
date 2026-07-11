import { describe, expect, it } from "vitest";
import {
  buildResolveSystemPrompt,
  buildResolveUserMessage,
  collectPendingConnectionGroups,
  describeNeighbors,
  resolvePendingConnections,
} from "../decomposed-generation";

function planSchema() {
  return {
    version: "1.0",
    program_id: "p1",
    program_name: "Digest",
    execution_mode: "autonomous",
    nodes: [
      { id: "n1", type: "trigger", label: "Every morning", description: "", config: { trigger_type: "cron", expression: "0 8 * * *", timezone: "UTC" }, position: { x: 100, y: 200 } },
      {
        id: "n2",
        type: "connection",
        label: "Fetch unread emails",
        description: "Lists unread inbox emails from Gmail.",
        connection: "My Gmail",
        config: { connector_type: "pending", provider: "gmail", purpose: "List unread emails from the inbox", scope_access: "read", scope_required: [] },
        position: { x: 420, y: 200 },
      },
      {
        id: "n3",
        type: "step",
        label: "Filter non-empty",
        description: "",
        connection: null,
        config: { logic_type: "filter", condition: "len(data['n2'].get('emails',[]))>0", pass_schema: null },
        position: { x: 740, y: 200 },
      },
      {
        id: "n4",
        type: "connection",
        label: "Send to Slack",
        description: "Posts the digest to #general.",
        connection: "My Slack",
        config: { connector_type: "pending", provider: "slack", purpose: "Post the digest text to the #general channel", scope_access: "write", scope_required: [] },
        position: { x: 1060, y: 200 },
      },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", type: "data_flow" },
      { id: "e2", from: "n2", to: "n3", type: "data_flow" },
      { id: "e3", from: "n3", to: "n4", type: "data_flow" },
    ],
    triggers: [{ node_id: "n1", type: "cron", is_active: true }],
  };
}

describe("collectPendingConnectionGroups", () => {
  it("groups pending connection nodes by provider", () => {
    const groups = collectPendingConnectionGroups(planSchema());
    expect([...groups.keys()].sort()).toEqual(["gmail", "slack"]);
    expect(groups.get("gmail")).toEqual([
      { id: "n2", purpose: "List unread emails from the inbox", connectionName: "My Gmail" },
    ]);
    expect(groups.get("slack")).toEqual([
      { id: "n4", purpose: "Post the digest text to the #general channel", connectionName: "My Slack" },
    ]);
  });

  it("ignores connection nodes that are already fully resolved", () => {
    const schema = planSchema();
    (schema.nodes[1]!.config as Record<string, unknown>) = {
      connector_type: "oauth",
      provider: "gmail",
      operation: "list_emails",
      operation_params: { max_results: 20 },
      scope_access: "read",
      scope_required: [],
    };
    const groups = collectPendingConnectionGroups(schema);
    expect(groups.has("gmail")).toBe(false);
    expect(groups.has("slack")).toBe(true);
  });

  it("catches a half-compliant model that omits connector_type but still leaves a purpose", () => {
    const schema = planSchema();
    (schema.nodes[1]!.config as Record<string, unknown>) = { provider: "gmail", purpose: "List unread emails", scope_access: "read" };
    const groups = collectPendingConnectionGroups(schema);
    expect(groups.has("gmail")).toBe(true);
  });

  it("returns an empty map for malformed input", () => {
    expect(collectPendingConnectionGroups(null).size).toBe(0);
    expect(collectPendingConnectionGroups({}).size).toBe(0);
    expect(collectPendingConnectionGroups({ nodes: "not an array" }).size).toBe(0);
  });
});

describe("describeNeighbors", () => {
  it("finds immediate upstream and downstream nodes", () => {
    const { upstream, downstream } = describeNeighbors(planSchema(), "n2");
    expect(upstream[0]).toContain("n1");
    expect(upstream[0]).toContain("trigger");
    expect(downstream[0]).toContain("n3");
    expect(downstream[0]).toContain("Filter non-empty");
  });

  it("returns empty arrays for a node with no edges", () => {
    const { upstream, downstream } = describeNeighbors(planSchema(), "does-not-exist");
    expect(upstream).toEqual([]);
    expect(downstream).toEqual([]);
  });
});

describe("buildResolveSystemPrompt", () => {
  it("includes only the requested provider's operation docs", () => {
    const prompt = buildResolveSystemPrompt("gmail");
    expect(prompt).toContain("GMAIL:");
    expect(prompt).toContain("list_emails");
    expect(prompt).not.toContain("SLACK:");
    expect(prompt).not.toContain("send_message");
  });

  it("falls back to a generic HTTP instruction for an unknown provider", () => {
    const prompt = buildResolveSystemPrompt("some-unlisted-provider");
    expect(prompt).toContain("no documented native operations");
    expect(prompt).toContain("HTTP connection instead");
  });

  it("includes live capability data when provided", () => {
    const withCapabilities = buildResolveSystemPrompt("notion", "LIVE CONNECTION CAPABILITIES:\n  - database: [NOTION_DATABASE_1]");
    const without = buildResolveSystemPrompt("notion");
    expect(withCapabilities).toContain("[NOTION_DATABASE_1]");
    expect(without).not.toContain("LIVE CONNECTION CAPABILITIES");
  });
});

describe("buildResolveUserMessage", () => {
  it("includes the task, node purpose, and neighbor context", () => {
    const msg = buildResolveUserMessage(
      [{ id: "n2", purpose: "List unread emails", connectionName: "My Gmail", upstream: ["n1 (trigger)"], downstream: ["n3 (step)"] }],
      "Digest my inbox every morning"
    );
    expect(msg).toContain("Digest my inbox every morning");
    expect(msg).toContain("n2");
    expect(msg).toContain("List unread emails");
    expect(msg).toContain("My Gmail");
    expect(msg).toContain("n1 (trigger)");
    expect(msg).toContain("n3 (step)");
  });
});

describe("resolvePendingConnections", () => {
  it("merges resolved configs back into the schema by node id", async () => {
    const schema = planSchema();
    const calls: string[] = [];
    const { resolvedProviders, failedProviders } = await resolvePendingConnections(
      schema,
      "Digest my inbox every morning",
      async (systemPrompt, userMessage) => {
        calls.push(userMessage);
        if (systemPrompt.includes("GMAIL:")) {
          return JSON.stringify({ n2: { connector_type: "oauth", operation: "list_emails", operation_params: { max_results: 20 }, scope_access: "read", scope_required: [] } });
        }
        return JSON.stringify({ n4: { connector_type: "oauth", operation: "send_message", operation_params: { channel: "#general", text: "hi" }, scope_access: "write", scope_required: [] } });
      }
    );

    expect(resolvedProviders.sort()).toEqual(["gmail", "slack"]);
    expect(failedProviders).toEqual([]);
    expect(calls).toHaveLength(2);

    const gmailNode = schema.nodes.find((n) => n.id === "n2")!;
    expect(gmailNode.config).toEqual({
      connector_type: "oauth",
      operation: "list_emails",
      operation_params: { max_results: 20 },
      scope_access: "read",
      scope_required: [],
    });
    const slackNode = schema.nodes.find((n) => n.id === "n4")!;
    expect((slackNode.config as Record<string, unknown>).operation).toBe("send_message");
  });

  it("leaves a provider's nodes as the pending placeholder when its resolve call throws", async () => {
    const schema = planSchema();
    const originalGmailConfig = { ...(schema.nodes[1]!.config as Record<string, unknown>) };

    const { resolvedProviders, failedProviders } = await resolvePendingConnections(
      schema,
      "task",
      async (systemPrompt) => {
        if (systemPrompt.includes("GMAIL:")) throw new Error("model unavailable");
        return JSON.stringify({ n4: { connector_type: "oauth", operation: "send_message", operation_params: {}, scope_access: "write", scope_required: [] } });
      }
    );

    expect(failedProviders).toEqual(["gmail"]);
    expect(resolvedProviders).toEqual(["slack"]);
    expect(schema.nodes.find((n) => n.id === "n2")!.config).toEqual(originalGmailConfig);
  });

  it("leaves nodes unresolved when the model returns malformed JSON", async () => {
    const schema = planSchema();
    const { resolvedProviders, failedProviders } = await resolvePendingConnections(
      schema,
      "task",
      async () => "not valid json"
    );
    expect(resolvedProviders).toEqual([]);
    expect(failedProviders.sort()).toEqual(["gmail", "slack"]);
  });

  it("is a no-op when there are no pending connection nodes", async () => {
    const schema = { ...planSchema(), nodes: [planSchema().nodes[0]!] };
    let called = false;
    const { resolvedProviders, failedProviders } = await resolvePendingConnections(schema, "task", async () => {
      called = true;
      return "{}";
    });
    expect(called).toBe(false);
    expect(resolvedProviders).toEqual([]);
    expect(failedProviders).toEqual([]);
  });

  it("calls onProviderStart once per provider group", async () => {
    const schema = planSchema();
    const started: string[] = [];
    await resolvePendingConnections(
      schema,
      "task",
      async () => "{}",
      (provider) => started.push(provider)
    );
    expect(started.sort()).toEqual(["gmail", "slack"]);
  });

  it("passes each provider's own capability section into its resolve call, never another provider's", async () => {
    const schema = planSchema();
    const systemPromptsByProvider = new Map<string, string>();
    const capabilityByProvider = new Map([
      ["gmail", "LIVE CONNECTION CAPABILITIES:\n  - label: [GMAIL_LABEL_1]"],
      ["slack", "LIVE CONNECTION CAPABILITIES:\n  - channel: [SLACK_CHANNEL_1]"],
    ]);

    await resolvePendingConnections(
      schema,
      "task",
      async (systemPrompt) => {
        if (systemPrompt.includes("GMAIL:")) systemPromptsByProvider.set("gmail", systemPrompt);
        if (systemPrompt.includes("SLACK:")) systemPromptsByProvider.set("slack", systemPrompt);
        return "{}";
      },
      undefined,
      capabilityByProvider
    );

    expect(systemPromptsByProvider.get("gmail")).toContain("[GMAIL_LABEL_1]");
    expect(systemPromptsByProvider.get("gmail")).not.toContain("[SLACK_CHANNEL_1]");
    expect(systemPromptsByProvider.get("slack")).toContain("[SLACK_CHANNEL_1]");
    expect(systemPromptsByProvider.get("slack")).not.toContain("[GMAIL_LABEL_1]");
  });
});
