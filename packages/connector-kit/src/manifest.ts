// ─── Connector Manifest ─────────────────────────────────────────────────────
// Utilities for building and reading connector manifests.
// Compatible with the existing manifest format at packages/schema/connectors.manifest.json
// and the web app loader at apps/web/lib/genesis/connector-manifest.ts.

import type {
  ConnectorDefinition,
  ConnectorManifestEntry,
  ManifestData,
  ManifestConnectorEntry,
} from "./types.js";

// ─── Manifest Builder ───────────────────────────────────────────────────────

/**
 * Convert a ConnectorDefinition into a manifest-compatible entry.
 * This bridges the SDK's rich typed definition to the flat manifest format
 * consumed by the web app.
 */
export function connectorToManifestEntry(def: ConnectorDefinition): ManifestConnectorEntry {
  const operations = def.operations.map((op) => ({
    name: op.name,
    description: op.description,
    parameters: [
      // Include the standard params that the runtime expects
      { name: "operation", type: "str" },
      { name: "params", type: "dict[str, Any]" },
      { name: "access_token", type: "str" },
      // Add input fields as additional params
      ...op.input_fields.map((f) => ({
        name: f.name,
        type: f.kind,
      })),
    ],
  }));

  return {
    operations,
    operation_count: operations.length,
  };
}

/**
 * Build a full manifest from multiple connector definitions.
 */
export function buildManifest(
  connectors: ConnectorDefinition[],
  existingManifest?: ManifestData,
): ManifestData {
  const connectorEntries: Record<string, ManifestConnectorEntry> = {};

  // Start with existing manifest entries if provided
  if (existingManifest) {
    Object.assign(connectorEntries, existingManifest.connectors);
  }

  // Add/overwrite with new connector definitions
  for (const def of connectors) {
    connectorEntries[def.provider] = connectorToManifestEntry(def);
  }

  return {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    connector_count: Object.keys(connectorEntries).length,
    connectors: connectorEntries,
  };
}

/**
 * Serialize a manifest to JSON string.
 */
export function serializeManifest(manifest: ManifestData): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Parse a manifest from JSON string.
 * Returns null if the JSON is invalid or doesn't match the expected shape.
 */
export function parseManifest(json: string): ManifestData | null {
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.version !== "string" ||
      typeof parsed.connector_count !== "number" ||
      typeof parsed.connectors !== "object"
    ) {
      return null;
    }
    return parsed as ManifestData;
  } catch {
    return null;
  }
}

// ─── Manifest Query Helpers ─────────────────────────────────────────────────

/**
 * Find all operations across all connectors matching a search query.
 * Compatible with the search format used by NodePalettePanel.tsx.
 */
export function searchManifestOperations(
  manifest: ManifestData,
  query: string,
  limit = 10,
): Array<{
  provider: string;
  operation: string;
  description: string;
}> {
  const queryLower = query.toLowerCase();
  const results: Array<{
    provider: string;
    operation: string;
    description: string;
  }> = [];

  for (const [provider, entry] of Object.entries(manifest.connectors)) {
    for (const op of entry.operations) {
      const matchesName = op.name.toLowerCase().includes(queryLower);
      const matchesDesc = op.description.toLowerCase().includes(queryLower);
      const matchesProvider = provider.toLowerCase().includes(queryLower);

      if (matchesName || matchesDesc || matchesProvider) {
        results.push({
          provider,
          operation: op.name,
          description: op.description || `${provider}: ${op.name}`,
        });
      }
    }
  }

  return results.slice(0, limit);
}

/**
 * Get all operations for a specific provider.
 */
export function getProviderOperations(
  manifest: ManifestData,
  provider: string,
): ManifestConnectorEntry["operations"] {
  return manifest.connectors[provider]?.operations ?? [];
}

/**
 * List all provider slugs in the manifest.
 */
export function listProviders(manifest: ManifestData): string[] {
  return Object.keys(manifest.connectors).sort();
}
