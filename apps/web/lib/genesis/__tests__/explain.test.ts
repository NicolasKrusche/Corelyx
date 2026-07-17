import { describe, expect, it } from "vitest";

import {
  explainNode,
  getNodeAlternatives,
  describeCron,
  providerLabel,
} from "../explain";
import type { Node, ProgramSchema, Edge } from "@flowos/schema";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function schemaOf(nodes: Node[], edges: Edge[] = []): ProgramSchema {
  return {
    version: "1.0",
    program_id: "p1",
    program_name: "Test",
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
      last_run_id: null,
      last_run_status: null,
      last_run_timestamp: null,
    },
  };
}

const pos = { x: 0, y: 0 };

function cronTrigger(expression: string, timezone = "UTC"): Node {
  return {
    id: "n1",
    type: "trigger",
    label: "Schedule",
    description: "",
    connection: null,
    status: "idle",
    position: pos,
    config: { trigger_type: "cron", expression, timezone },
  };
}

function gmailNode(operation: string, extra: Record<string, unknown> = {}): Node {
  return {
    id: "n2",
    type: "connection",
    label: "Fetch unread emails",
    description: "",
    connection: "My Gmail",
    status: "idle",
    position: pos,
    config: {
      connector_type: "oauth",
      provider: "gmail",
      scope_access: "read",
      scope_required: [],
      operation,
      operation_params: {},
      ...extra,
    },
  };
}

// ─── describeCron ───────────────────────────────────────────────────────────

describe("describeCron", () => {
  it("humanizes common shapes", () => {
    expect(describeCron("* * * * *")).toBe("every minute");
    expect(describeCron("*/5 * * * *")).toBe("every 5 minutes");
    expect(describeCron("0 * * * *")).toBe("at the top of every hour");
    expect(describeCron("0 8 * * *", "UTC")).toBe("every day at 08:00 UTC");
    expect(describeCron("30 9 * * 1-5", "UTC")).toBe("every weekday at 09:30 UTC");
    expect(describeCron("0 9 * * 1", "UTC")).toBe("every Monday at 09:00 UTC");
    expect(describeCron("0 0 1 * *", "UTC")).toBe("on the 1st of every month at 00:00 UTC");
  });

  it("appends a non-UTC timezone", () => {
    expect(describeCron("0 8 * * *", "Europe/Vienna")).toBe("every day at 08:00 (Europe/Vienna)");
  });

  it("falls back to quoting an unusual expression", () => {
    expect(describeCron("7 4 */3 2 5")).toContain("`7 4 */3 2 5`");
  });
});

// ─── explainNode ────────────────────────────────────────────────────────────

describe("explainNode", () => {
  it("explains a cron trigger and names the first downstream node", () => {
    const trigger = cronTrigger("0 8 * * 1-5");
    const gmail = gmailNode("list_emails");
    const schema = schemaOf([trigger, gmail], [
      { id: "e1", from: "n1", to: "n2", type: "data_flow", data_mapping: null, condition: null, label: null },
    ]);
    const out = explainNode(trigger, schema);
    expect(out.headline).toBe("Runs on a schedule");
    expect(out.why).toContain("every weekday at 08:00 UTC");
    expect(out.why).toContain("Fetch unread emails");
  });

  it("explains a manual trigger", () => {
    const trigger: Node = {
      id: "n1",
      type: "trigger",
      label: "Manual",
      description: "",
      connection: null,
      status: "idle",
      position: pos,
      config: { trigger_type: "manual" },
    };
    const out = explainNode(trigger, schemaOf([trigger]));
    expect(out.headline).toBe("Runs on demand");
    expect(out.why).toContain("press Run");
  });

  it("explains a read-only OAuth connector and mentions downstream data flow", () => {
    const gmail = gmailNode("list_emails");
    const slack: Node = {
      id: "n3",
      type: "connection",
      label: "Post digest",
      description: "",
      connection: "My Slack",
      status: "idle",
      position: pos,
      config: { connector_type: "oauth", provider: "slack", scope_access: "write", scope_required: [], operation: "send_message", operation_params: {} },
    };
    const schema = schemaOf([gmail, slack], [
      { id: "e1", from: "n2", to: "n3", type: "data_flow", data_mapping: null, condition: null, label: null },
    ]);
    const out = explainNode(gmail, schema);
    expect(out.headline).toBe("Gmail: list emails");
    expect(out.why).toContain("Post digest");
  });

  it("flags destructive connector operations as approval-gated", () => {
    const del = gmailNode("delete_email", { scope_access: "write" });
    const out = explainNode(del, schemaOf([del]));
    expect(out.why).toContain("destructive");
    expect(out.why).toContain("approval");
  });

  it("treats permanent:true params as destructive", () => {
    const del = gmailNode("archive_email", { scope_access: "write", operation_params: { permanent: true } });
    const out = explainNode(del, schemaOf([del]));
    expect(out.why).toContain("destructive");
  });

  it("explains an agent node and its approval pause", () => {
    const agent: Node = {
      id: "n4",
      type: "agent",
      label: "Summarize",
      description: "",
      connection: null,
      status: "idle",
      position: pos,
      config: {
        model: "__USER_ASSIGNED__",
        api_key_ref: "__USER_ASSIGNED__",
        system_prompt: "Summarize",
        input_schema: null,
        output_schema: null,
        requires_approval: true,
        approval_timeout_hours: 24,
        scope_required: null,
        scope_access: "read",
        retry: { max_attempts: 3, backoff: "exponential", backoff_base_seconds: 5, fail_program_on_exhaust: false },
        tools: [],
      },
    };
    const out = explainNode(agent, schemaOf([agent]));
    expect(out.headline).toBe("AI reasoning step");
    expect(out.why).toContain("approval");
  });

  it("explains a filter step by quoting its condition", () => {
    const filter: Node = {
      id: "n5",
      type: "step",
      label: "Non-empty",
      description: "",
      connection: null,
      status: "idle",
      position: pos,
      config: { logic_type: "filter", condition: "len(data['n2'].get('emails',[]))>0", pass_schema: null },
    };
    const out = explainNode(filter, schemaOf([filter]));
    expect(out.headline).toBe("Stops early when empty");
    expect(out.why).toContain("len(data['n2'].get('emails',[]))>0");
  });

  it("explains an HTTP connector with its host", () => {
    const http: Node = {
      id: "n6",
      type: "connection",
      label: "Call API",
      description: "",
      connection: null,
      status: "idle",
      position: pos,
      config: {
        connector_type: "http",
        method: "POST",
        url: "https://api.example.com/v1/thing",
        auth_type: "bearer",
        auth_value: null,
        query_params: [],
        headers: [],
        body: null,
        parse_response: true,
        timeout_seconds: 30,
        retry: null,
      },
    };
    const out = explainNode(http, schemaOf([http]));
    expect(out.headline).toBe("HTTP request (POST)");
    expect(out.why).toContain("api.example.com");
  });

  it("explains note and group nodes as non-executing", () => {
    const note: Node = {
      id: "g1", type: "note", label: "Setup", description: "", connection: null, status: "idle", position: pos,
      config: { content: "Do X first", color: "yellow" },
    };
    expect(explainNode(note, schemaOf([note])).why).toContain("never runs");
  });
});

// ─── getNodeAlternatives ────────────────────────────────────────────────────

describe("getNodeAlternatives", () => {
  it("offers same-category swaps for an email connector", () => {
    const gmail = gmailNode("send_email");
    const alts = getNodeAlternatives(gmail, schemaOf([gmail]));
    const providers = alts.map((a) => a.provider);
    expect(providers).toContain("outlook");
    expect(providers).not.toContain("gmail");
    expect(alts[0].refinement).toContain("Fetch unread emails");
    expect(alts[0].refinement).toContain(providerLabel(alts[0].provider));
  });

  it("caps the number of suggestions", () => {
    const slack: Node = {
      id: "n3", type: "connection", label: "Notify", description: "", connection: "My Slack", status: "idle", position: pos,
      config: { connector_type: "oauth", provider: "slack", scope_access: "write", scope_required: [], operation: "send_message", operation_params: {} },
    };
    expect(getNodeAlternatives(slack, schemaOf([slack]), 2).length).toBe(2);
  });

  it("returns nothing for HTTP connectors, unknown providers, or non-connectors", () => {
    const http: Node = {
      id: "n6", type: "connection", label: "Call API", description: "", connection: null, status: "idle", position: pos,
      config: { connector_type: "http", method: "GET", url: "https://x.com", auth_type: "none", auth_value: null, query_params: [], headers: [], body: null, parse_response: true, timeout_seconds: null, retry: null },
    };
    expect(getNodeAlternatives(http, schemaOf([http]))).toEqual([]);

    const unknown = gmailNode("send_email", { provider: "somethingweird" });
    expect(getNodeAlternatives(unknown, schemaOf([unknown]))).toEqual([]);

    const trigger = cronTrigger("0 8 * * *");
    expect(getNodeAlternatives(trigger, schemaOf([trigger]))).toEqual([]);
  });
});
