import { describe, expect, it } from "vitest";
import { sanitizeSchemaForPublicCopy } from "@/lib/programs/public-schema";

/* What a published program must never hand to the person copying it. The
   previous sanitiser only rewrote `api_key_ref` on nodes whose type was
   exactly "agent", so an HTTP connector's `auth_value` — the raw bearer token
   the author typed into the editor — was copied verbatim into every fork. */

const seq = () => {
  let n = 0;
  return () => `generated-${++n}`;
};

function schemaWith(...nodes: unknown[]) {
  return { program_name: "Test", nodes, edges: [] };
}

function nodesOf(result: Record<string, unknown>) {
  return result.nodes as Array<Record<string, unknown>>;
}

describe("sanitizeSchemaForPublicCopy", () => {
  it("strips an HTTP connector's auth value", () => {
    const result = sanitizeSchemaForPublicCopy(
      schemaWith({
        id: "http-1",
        type: "connection",
        config: {
          connector_type: "http",
          url: "https://api.example.com",
          auth_type: "bearer",
          auth_value: "sk-live-not-yours",
          headers: [],
          query_params: [],
        },
      }),
      seq(),
    );

    const config = nodesOf(result)[0].config as Record<string, unknown>;
    expect(config.auth_value).toBeNull();
    // The auth *type* stays so the forker knows what to supply.
    expect(config.auth_type).toBe("bearer");
  });

  it("redacts credential-bearing headers and query params but keeps ordinary ones", () => {
    const result = sanitizeSchemaForPublicCopy(
      schemaWith({
        id: "http-1",
        type: "connection",
        config: {
          connector_type: "http",
          auth_type: "none",
          auth_value: null,
          headers: [
            { key: "X-Api-Key", value: "secret-key" },
            { key: "Authorization", value: "Bearer nope" },
            { key: "Content-Type", value: "application/json" },
          ],
          query_params: [
            { key: "access_token", value: "leaky" },
            { key: "page", value: "1" },
          ],
        },
      }),
      seq(),
    );

    const config = nodesOf(result)[0].config as Record<string, unknown>;
    expect(config.headers).toEqual([
      { key: "X-Api-Key", value: "" },
      { key: "Authorization", value: "" },
      { key: "Content-Type", value: "application/json" },
    ]);
    expect(config.query_params).toEqual([
      { key: "access_token", value: "" },
      { key: "page", value: "1" },
    ]);
  });

  it("replaces the api key reference on agent and agent_task nodes alike", () => {
    const result = sanitizeSchemaForPublicCopy(
      schemaWith(
        { id: "a", type: "agent", config: { model: "gpt-4o", api_key_ref: "a-real-uuid" } },
        { id: "t", type: "agent_task", config: { model: "gpt-4o", api_key_ref: "another-uuid" } },
      ),
      seq(),
    );

    for (const node of nodesOf(result)) {
      expect((node.config as Record<string, unknown>).api_key_ref).toBe("__USER_ASSIGNED__");
    }
  });

  it("clears device ids and reissues webhook endpoints", () => {
    const newId = seq();
    const result = sanitizeSchemaForPublicCopy(
      schemaWith(
        {
          id: "w",
          type: "trigger",
          config: { trigger_type: "webhook", endpoint_id: "publisher-endpoint", method: "POST" },
        },
        {
          id: "fw",
          type: "trigger",
          config: { trigger_type: "file_watch", device_id: "publisher-laptop", path: "/x", events: [], patterns: [] },
        },
        {
          id: "f",
          type: "connection",
          config: { connector_type: "file", device_id: "publisher-laptop", operation: "read", operation_params: {} },
        },
      ),
      newId,
    );

    const [webhook, fileWatch, fileNode] = nodesOf(result).map(
      (node) => node.config as Record<string, unknown>,
    );
    expect(webhook.endpoint_id).not.toBe("publisher-endpoint");
    // Non-empty: the field is `.min(1)` in the schema, so it cannot be blanked.
    expect(webhook.endpoint_id).toBeTruthy();
    expect(fileWatch.device_id).toBeNull();
    expect(fileNode.device_id).toBeNull();
  });

  it("does not mutate the schema it was given", () => {
    const original = schemaWith({
      id: "http-1",
      type: "connection",
      config: { connector_type: "http", auth_type: "bearer", auth_value: "still-mine", headers: [], query_params: [] },
    });

    sanitizeSchemaForPublicCopy(original, seq());

    const config = (original.nodes[0] as Record<string, unknown>).config as Record<string, unknown>;
    expect(config.auth_value).toBe("still-mine");
  });

  it("leaves OAuth connection nodes alone — they carry no inline secret", () => {
    const config = {
      connector_type: "oauth",
      provider: "gmail",
      scope_access: "read",
      scope_required: ["gmail.readonly"],
      operation: "send_email",
    };
    const result = sanitizeSchemaForPublicCopy(
      schemaWith({ id: "g", type: "connection", connection: "Gmail", config }),
      seq(),
    );
    expect(nodesOf(result)[0].config).toEqual(config);
  });

  it("survives malformed input rather than throwing on the fork path", () => {
    expect(sanitizeSchemaForPublicCopy(null, seq())).toEqual({});
    expect(sanitizeSchemaForPublicCopy({ nodes: "not-an-array" }, seq())).toEqual({
      nodes: [],
    });
    const noConfig = sanitizeSchemaForPublicCopy(schemaWith({ id: "x", type: "agent" }), seq());
    expect(nodesOf(noConfig)[0]).toEqual({ id: "x", type: "agent" });
  });
});
