/**
 * Safe accessors for connection-node config fields.
 *
 * `ConnectionConfig` is a union of three shapes, and the fields the compliance
 * reports want are not shared across them:
 *
 *   - OAuth  → `provider`, `operation` (both optional)
 *   - HTTP   → neither; it has `url` / `method`
 *   - File   → `operation`, no `provider`
 *
 * Reading `config.provider` straight off the union does not type-check, and
 * reading it through a cast silently yields `undefined` for HTTP and file
 * nodes. These helpers narrow properly so the reports degrade to a sensible
 * label instead of to `undefined`.
 */

import type {
  ConnectionConfig,
  ConnectionNode,
  OAuthConnectionConfig,
} from "@flowos/schema";

/**
 * OAuth is the only variant carrying `provider`.
 *
 * Note this is not a plain discriminated-union check: `connector_type` is
 * *optional* on the OAuth member, for backward compatibility with schemas
 * written before the discriminant existed. An absent discriminant therefore
 * means OAuth.
 */
function isOAuthConfig(config: ConnectionConfig): config is OAuthConnectionConfig {
  return config.connector_type === undefined || config.connector_type === "oauth";
}

/** Provider slug for a connection node, lowercased. Empty string if unknown. */
export function connectorProvider(node: ConnectionNode): string {
  const config = node.config;
  const fromConfig = config && isOAuthConfig(config) ? config.provider : undefined;
  // `node.connection` is the bound account, used as the fallback label when the
  // node has no provider slug of its own (HTTP and file nodes never do).
  return (fromConfig ?? node.connection ?? "").toLowerCase();
}

/**
 * Operation the node performs, lowercased. Empty string when none is
 * configured.
 */
export function connectorOperation(node: ConnectionNode): string {
  const config = node.config;
  if (!config) return "";
  if (isOAuthConfig(config)) return (config.operation ?? "").toLowerCase();
  if (config.connector_type === "file") return config.operation.toLowerCase();
  // HTTP: the verb is the closest thing to an operation for reporting.
  return config.method.toLowerCase();
}
