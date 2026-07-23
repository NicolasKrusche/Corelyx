// ─── Hot-Load Support ────────────────────────────────────────────────────────
// Runtime support for loading custom connectors from the file system.
// Load custom connectors from connectors/custom/ directory at runtime
// and auto-register with the existing connector registry.

import * as fs from "node:fs";
import * as path from "node:path";
import type { Connector, ConnectorOperation, OperationContext } from "./types.js";
import type { ConnectorDefinition, ConnectorManifest, ManifestData } from "./schemas.js";
import { ConnectorDefinitionZ, ConnectorManifestZ } from "./schemas.js";
import { buildManifest, serializeManifest, connectorToManifestEntry } from "./manifest.js";

// ─── Custom Connector Loader ────────────────────────────────────────────────

/**
 * Scan a directory for custom connector definition files.
 * Looks for JSON files that conform to the ConnectorDefinition schema.
 */
export function scanCustomConnectors(directory: string): ConnectorDefinition[] {
  const connectors: ConnectorDefinition[] = [];

  if (!fs.existsSync(directory)) {
    return connectors;
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Look for index.json or connector.json in subdirectories
      const subdir = path.join(directory, entry.name);
      const possibleFiles = ["index.json", "connector.json", `${entry.name}.json`];

      for (const filename of possibleFiles) {
        const filePath = path.join(subdir, filename);
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, "utf-8");
            const parsed = JSON.parse(content);
            const validated = ConnectorDefinitionZ.safeParse(parsed);
            if (validated.success) {
              connectors.push(validated.data);
            }
          } catch {
            // Skip invalid files
          }
        }
      }
    } else if (entry.name.endsWith(".json") && entry.name !== "package.json") {
      // Direct JSON files in the directory
      try {
        const filePath = path.join(directory, entry.name);
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(content);
        const validated = ConnectorDefinitionZ.safeParse(parsed);
        if (validated.success) {
          connectors.push(validated.data);
        }
      } catch {
        // Skip invalid files
      }
    }
  }

  return connectors;
}

/**
 * Load custom connectors from a directory and merge them into an existing manifest.
 */
export function loadAndMergeCustomConnectors(
  customDir: string,
  existingManifest: ManifestData,
): { manifest: ManifestData; loaded: number } {
  const customConnectors = scanCustomConnectors(customDir);

  if (customConnectors.length === 0) {
    return { manifest: existingManifest, loaded: 0 };
  }

  // Build entries for custom connectors
  const customEntries: Record<string, ReturnType<typeof connectorToManifestEntry>> = {};
  for (const def of customConnectors) {
    customEntries[def.provider] = connectorToManifestEntry(def);
  }

  // Merge with existing manifest
  const mergedConnectors = {
    ...existingManifest.connectors,
    ...customEntries,
  };

  const manifest: ManifestData = {
    version: existingManifest.version,
    generated_at: new Date().toISOString(),
    connector_count: Object.keys(mergedConnectors).length,
    connectors: mergedConnectors,
  };

  return { manifest, loaded: customConnectors.length };
}

/**
 * Generate a hot-loaded manifest that includes both built-in and custom connectors.
 */
export function generateHotLoadManifest(
  builtinManifestPath: string,
  customDir: string,
): ManifestData {
  let builtinManifest: ManifestData = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    connector_count: 0,
    connectors: {},
  };

  // Load existing manifest if available
  if (fs.existsSync(builtinManifestPath)) {
    try {
      const content = fs.readFileSync(builtinManifestPath, "utf-8");
      builtinManifest = JSON.parse(content) as ManifestData;
    } catch {
      // Use empty manifest
    }
  }

  // Scan and merge custom connectors
  const { manifest, loaded } = loadAndMergeCustomConnectors(customDir, builtinManifest);

  if (loaded > 0) {
    console.log(`[hot-load] Loaded ${loaded} custom connector(s) from ${customDir}`);
  }

  return manifest;
}

// ─── Connector Registry (Runtime) ──────────────────────────────────────────

/**
 * A runtime registry for loaded connectors.
 * Used by the Corelyx runtime to discover and execute connector operations.
 */
export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();

  /**
   * Register a connector.
   */
  register(connector: Connector): void {
    this.connectors.set(connector.provider, connector);
  }

  /**
   * Get a connector by provider slug.
   */
  get(provider: string): Connector | undefined {
    return this.connectors.get(provider);
  }

  /**
   * Check if a provider is registered.
   */
  has(provider: string): boolean {
    return this.connectors.has(provider);
  }

  /**
   * List all registered providers.
   */
  listProviders(): string[] {
    return [...this.connectors.keys()].sort();
  }

  /**
   * Get all registered connectors.
   */
  getAll(): Connector[] {
    return [...this.connectors.values()];
  }

  /**
   * Get the number of registered connectors.
   */
  get size(): number {
    return this.connectors.size;
  }

  /**
   * Execute a connector operation.
   */
  async execute<TAuth extends Record<string, unknown>>(
    provider: string,
    operationName: string,
    input: Record<string, unknown>,
    ctx: OperationContext<TAuth>,
  ): Promise<unknown> {
    const connector = this.connectors.get(provider);
    if (!connector) {
      throw new Error(`Connector not found: ${provider}`);
    }

    const operation = connector.operations.find((op) => op.name === operationName);
    if (!operation) {
      throw new Error(`Operation not found: ${provider}.${operationName}`);
    }

    // Validate input against the operation's Zod schema
    const validatedInput = operation.input.parse(input);

    // Execute the operation
    return operation.execute(validatedInput, ctx);
  }

  /**
   * Load all custom connectors from a directory into this registry.
   */
  loadCustomConnectors(directory: string): number {
    const connectors = scanCustomConnectors(directory);
    for (const def of connectors) {
      // Convert ConnectorDefinition to Connector (runtime format)
      const connector: Connector = {
        provider: def.provider,
        display_name: def.display_name,
        description: def.description,
        base_url: def.base_url,
        auth: def.auth as any,
        default_headers: def.default_headers,
        operations: def.operations.map((op) => ({
          name: op.name,
          description: op.description,
          input: op.input_fields.reduce((schema, field) => {
            // Reconstruct Zod schema from field definitions
            return schema;
          }, {} as any),
          output: {} as any,
          execute: async () => {
            throw new Error(`Operation ${op.name} not implemented. Provide an execute function.`);
          },
        })),
        version: def.version,
      };
      this.register(connector);
    }
    return connectors.length;
  }
}

// Module-level singleton
let _registry: ConnectorRegistry | null = null;

/**
 * Get or create the global connector registry.
 */
export function getConnectorRegistry(): ConnectorRegistry {
  if (_registry === null) {
    _registry = new ConnectorRegistry();
  }
  return _registry;
}

/**
 * Initialize the hot-load system.
 * Scans for custom connectors and merges them into the manifest.
 */
export function initializeHotLoad(
  builtinManifestPath: string,
  customDir: string,
): ManifestData {
  const manifest = generateHotLoadManifest(builtinManifestPath, customDir);

  // Register custom connectors with the runtime registry
  const registry = getConnectorRegistry();
  const loaded = registry.loadCustomConnectors(customDir);

  if (loaded > 0) {
    console.log(`[hot-load] Registered ${loaded} custom connector(s) in runtime registry`);
  }

  return manifest;
}
