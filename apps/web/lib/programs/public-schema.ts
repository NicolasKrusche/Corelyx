/**
 * Strip publisher-specific credentials and infrastructure ids out of a workflow
 * schema before anyone other than its owner receives a copy.
 *
 * This runs when a program is copied OUT of Browse, not when it is published.
 * Publishing used to rewrite the owner's stored schema in place, which broke
 * the owner's own program: their agent nodes came back as __USER_ASSIGNED__,
 * which the runtime's preflight rejects as a critical error (PRE_004), and
 * unpublishing never restored them. The stored schema is now left alone and the
 * sanitising happens on the way out instead.
 *
 * Every value cleared here stays schema-valid: `api_key_ref` keeps the sentinel
 * the editor already understands, and the nulled fields are all declared
 * nullable in packages/schema. `endpoint_id` is `.min(1)` and so cannot be
 * blanked — it is reissued instead, which also stops every fork of one program
 * from sharing a single webhook endpoint.
 */

type JsonObject = Record<string, unknown>;

const USER_ASSIGNED = "__USER_ASSIGNED__";
const REDACTED = "";

/**
 * Header and query-parameter names whose value is a credential rather than a
 * parameter. `auth_value` is the field the editor designates for credentials,
 * but nothing stops a user typing a token into a header instead, and the
 * runtime sends headers verbatim.
 */
const CREDENTIAL_KEY_PATTERN =
  /(authorization|api[-_ ]?key|apikey|token|secret|password|passwd|credential|cookie|session)/i;

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeKeyValuePairs(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((pair) => {
    if (!isRecord(pair) || typeof pair.key !== "string") return pair;
    return CREDENTIAL_KEY_PATTERN.test(pair.key) ? { ...pair, value: REDACTED } : pair;
  });
}

function sanitizeNodeConfig(type: unknown, config: JsonObject, newId: () => string): JsonObject {
  if (type === "agent" || type === "agent_task") {
    // A vault-backed key reference belonging to the publisher's workspace.
    return typeof config.api_key_ref === "string" && config.api_key_ref !== ""
      ? { ...config, api_key_ref: USER_ASSIGNED }
      : config;
  }

  if (type === "connection") {
    if (config.connector_type === "http") {
      return {
        ...config,
        // The raw bearer token / API key / "username:password" the publisher
        // typed into the editor.
        auth_value: null,
        headers: sanitizeKeyValuePairs(config.headers),
        query_params: sanitizeKeyValuePairs(config.query_params),
      };
    }
    if (config.connector_type === "file") {
      // Identifies a paired machine belonging to the publisher.
      return { ...config, device_id: null };
    }
    return config;
  }

  if (type === "trigger") {
    if (config.trigger_type === "webhook") {
      return { ...config, endpoint_id: newId() };
    }
    if (config.trigger_type === "file_watch") {
      return { ...config, device_id: null };
    }
    return config;
  }

  return config;
}

/**
 * Return a copy of `schema` safe to hand to a user who is not its author.
 *
 * `newId` is injected so callers can supply a deterministic generator in tests;
 * it defaults to `crypto.randomUUID`.
 */
export function sanitizeSchemaForPublicCopy(
  schema: unknown,
  newId: () => string = () => crypto.randomUUID()
): JsonObject {
  if (!isRecord(schema)) return {};

  const nodes = Array.isArray(schema.nodes) ? schema.nodes : [];

  return {
    ...schema,
    nodes: nodes.map((node) => {
      if (!isRecord(node)) return node;
      const config = isRecord(node.config) ? node.config : null;
      if (!config) return node;
      return { ...node, config: sanitizeNodeConfig(node.type, config, newId) };
    }),
  };
}
