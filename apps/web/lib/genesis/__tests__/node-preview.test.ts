import { describe, expect, it } from "vitest";

import { previewNodeOutput } from "../node-preview";

describe("previewNodeOutput — connectors", () => {
  it("returns catalogued OAuth operation shapes", () => {
    expect(
      previewNodeOutput({
        type: "connection",
        connection: "My Gmail",
        config: { connector_type: "oauth", provider: "gmail", scope_access: "read", scope_required: [], operation: "list_emails", operation_params: {} },
      })
    ).toBe("emails: [{ id, threadId }]");

    expect(
      previewNodeOutput({
        type: "connection",
        connection: "My Slack",
        config: { connector_type: "oauth", provider: "slack", scope_access: "write", scope_required: [], operation: "send_message", operation_params: {} },
      })
    ).toBe("{ ts, channel }");
  });

  it("falls back to a verb-prefix heuristic for unknown operations", () => {
    expect(
      previewNodeOutput({
        type: "connection",
        config: { connector_type: "oauth", provider: "stripe", scope_access: "read", scope_required: [], operation: "list_customers", operation_params: {} },
      })
    ).toBe("results: [ … ]");

    expect(
      previewNodeOutput({
        type: "connection",
        config: { connector_type: "oauth", provider: "stripe", scope_access: "write", scope_required: [], operation: "create_customer", operation_params: {} },
      })
    ).toBe("{ id }");

    expect(
      previewNodeOutput({
        type: "connection",
        config: { connector_type: "oauth", provider: "stripe", scope_access: "write", scope_required: [], operation: "delete_customer", operation_params: {} },
      })
    ).toBe("{ deleted: true }");
  });

  it("describes an OAuth node with no operation as a token pass-through", () => {
    expect(
      previewNodeOutput({
        type: "connection",
        config: { connector_type: "oauth", provider: "gmail", scope_access: "read", scope_required: [] },
      })
    ).toBe("access token (for later steps)");
  });

  it("handles HTTP and file connectors", () => {
    expect(
      previewNodeOutput({
        type: "connection",
        config: { connector_type: "http", method: "GET", url: "https://x.com", auth_type: "none", auth_value: null, query_params: [], headers: [], body: null, parse_response: true, timeout_seconds: null, retry: null },
      })
    ).toBe("response body (JSON)");

    expect(
      previewNodeOutput({
        type: "connection",
        config: { connector_type: "http", method: "GET", url: "https://x.com", auth_type: "none", auth_value: null, query_params: [], headers: [], body: null, parse_response: false, timeout_seconds: null, retry: null },
      })
    ).toBe("raw response text");

    expect(
      previewNodeOutput({
        type: "connection",
        config: { connector_type: "file", device_id: null, operation: "list", operation_params: { path: "/x" }, scope_access: "read" },
      })
    ).toBe("files: [{ name, path, size }]");
  });
});

describe("previewNodeOutput — steps", () => {
  it("previews each step by its config", () => {
    expect(previewNodeOutput({ type: "step", config: { logic_type: "format", template: "Hi {n}", output_key: "text" } })).toBe('{ text: "…" }');
    expect(previewNodeOutput({ type: "step", config: { logic_type: "loop", over: "data['n2']['emails']", item_var: "email" } })).toBe("one iteration per item in data['n2']['emails']");
    expect(previewNodeOutput({ type: "step", config: { logic_type: "sort", key: "created_at", order: "desc" } })).toBe('items: sorted by "created_at" (desc)');
    expect(previewNodeOutput({ type: "step", config: { logic_type: "filter", condition: "x>0", pass_schema: null } })).toContain("only when the condition passes");
  });
});

describe("previewNodeOutput — agent and triggers", () => {
  it("uses the agent output_schema keys when present", () => {
    expect(
      previewNodeOutput({
        type: "agent",
        config: {
          model: "__USER_ASSIGNED__", api_key_ref: "__USER_ASSIGNED__", system_prompt: "", input_schema: null,
          output_schema: { type: "object", properties: { summary: { type: "string" }, urgency: { type: "string" } } },
          requires_approval: false, approval_timeout_hours: 24, scope_required: null, scope_access: "read",
          retry: { max_attempts: 1, backoff: "none", backoff_base_seconds: 0, fail_program_on_exhaust: false }, tools: [],
        },
      })
    ).toBe("{ summary, urgency }");
  });

  it("falls back to a generic AI result when no output schema is set", () => {
    expect(
      previewNodeOutput({
        type: "agent",
        config: {
          model: "__USER_ASSIGNED__", api_key_ref: "__USER_ASSIGNED__", system_prompt: "", input_schema: null, output_schema: null,
          requires_approval: false, approval_timeout_hours: 24, scope_required: null, scope_access: "read",
          retry: { max_attempts: 1, backoff: "none", backoff_base_seconds: 0, fail_program_on_exhaust: false }, tools: [],
        },
      })
    ).toBe("AI result (JSON)");
  });

  it("previews data-carrying triggers and skips empty ones", () => {
    expect(previewNodeOutput({ type: "trigger", config: { trigger_type: "webhook", endpoint_id: "e", method: "POST" } })).toBe("request body (JSON)");
    expect(previewNodeOutput({ type: "trigger", config: { trigger_type: "event", source: "gmail", event: "message.received", filter: null } })).toBe("{ message_id, thread_id }");
    expect(previewNodeOutput({ type: "trigger", config: { trigger_type: "cron", expression: "0 8 * * *", timezone: "UTC" } })).toBeNull();
    expect(previewNodeOutput({ type: "trigger", config: { trigger_type: "manual" } })).toBeNull();
  });

  it("returns null for visual-only nodes", () => {
    expect(previewNodeOutput({ type: "note", config: { content: "x", color: "yellow" } })).toBeNull();
    expect(previewNodeOutput({ type: "group", config: { childIds: [], width: 100, height: 100 } })).toBeNull();
  });
});
