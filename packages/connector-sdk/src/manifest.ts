/**
 * @flowos/connector-sdk — Manifest Generator
 *
 * Build-time manifest generator that scans connector packages and generates
 * connectors.manifest.json. This is the TypeScript equivalent of
 * apps/runtime/scripts/generate_connector_manifest.py.
 *
 * Can be used as a library or via the CLI.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type ConnectorManifest, type ConnectorManifestEntry } from "./types.js";

// ─── Manifest Generator ──────────────────────────────────────────────────────

export interface ManifestGeneratorOptions {
  /** Root directory of the project (defaults to cwd) */
  rootDir?: string;
  /** Glob pattern for connector files (default: connector.ts) */
  connectorPattern?: string;
  /** Output path for the manifest (default: packages/schema/connectors.manifest.json) */
  outputPath?: string;
  /** Additional directories to scan for connectors */
  extraScanDirs?: string[];
}

/**
 * Scan a directory for connector TypeScript files and extract manifest info.
 * Each connector file must export a default or named `config` object
 * of type ConnectorConfig, or a class extending BaseConnector.
 */
async function scanConnectorFile(filePath: string): Promise<Partial<ConnectorManifestEntry> | null> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Try to extract provider name from common patterns
    const providerMatch =
      content.match(/provider\s*[=:]\s*["']([^"']+)["']/) ||
      content.match(/name\s*[=:]\s*["']([^"']+)["']/);
    const provider = providerMatch?.[1];

    if (!provider) return null;

    // Try to extract operation names
    const operations: Array<{ name: string; description: string; parameters: Array<{ name: string; type?: string }> }> = [];

    // Pattern 1: operation("name") builder pattern
    const operationBuilderPattern = /operation\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match;
    while ((match = operationBuilderPattern.exec(content)) !== null) {
      operations.push({
        name: match[1],
        description: "",
        parameters: [],
      });
    }

    // Pattern 2: _operation_schemas = [OperationSchema(name="...")]
    const schemaPattern = /OperationSchema\s*\(\s*\n?\s*name\s*=\s*["']([^"']+)["']/g;
    while ((match = schemaPattern.exec(content)) !== null) {
      if (!operations.find((op) => op.name === match![1])) {
        operations.push({
          name: match[1],
          description: "",
          parameters: [],
        });
      }
    }

    // Pattern 3: schema.name = "..." assignments
    const schemaNamePattern = /schema\s*\.\s*name\s*=\s*["']([^"']+)["']/g;
    while ((match = schemaNamePattern.exec(content)) !== null) {
      if (!operations.find((op) => op.name === match![1])) {
        operations.push({
          name: match[1],
          description: "",
          parameters: [],
        });
      }
    }

    // Try to extract descriptions from JSDoc or comments
    for (const op of operations) {
      const descPattern = new RegExp(
        `/\\*\\*[\\s\\S]*?\\*/\\s*(?:export\\s+)?(?:async\\s+)?(?:function\\s+)?(?:class\\s+)?\\w*\\s*[<(]?.*?["']${op.name}["']`,
        "m"
      );
      const descMatch = content.match(descPattern);
      if (descMatch) {
        const jsDocMatch = descMatch[0].match(/\/\*\*\s*([\s\S]*?)\s*\*\//);
        if (jsDocMatch) {
          op.description = jsDocMatch[1]
            .split("\n")
            .map((l) => l.replace(/^\s*\*\s?/, "").trim())
            .filter(Boolean)
            .join(" ")
            .trim();
        }
      }
    }

    if (operations.length === 0) return null;

    return {
      operations,
      operation_count: operations.length,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a connector manifest from scanned connector files.
 */
export async function generateConnectorManifest(
  options: ManifestGeneratorOptions = {}
): Promise<ConnectorManifest> {
  const {
    rootDir = process.cwd(),
    connectorPattern = "**/connector.ts",
    extraScanDirs = [],
  } = options;

  const connectors: Record<string, ConnectorManifestEntry> = {};

  // Scan for connector files
  const glob = await import("glob");
  const patterns = [connectorPattern, ...extraScanDirs.map((d) => path.join(d, connectorPattern))];

  for (const pattern of patterns) {
    const files = await glob.glob(pattern, {
      cwd: rootDir,
      absolute: true,
      ignore: ["**/node_modules/**", "**/dist/**"],
    });

    for (const file of files) {
      const info = await scanConnectorFile(file);
      if (info) {
        // Derive provider from filename if not found in content
        const provider = path.basename(file, path.extname(file));
        if (!connectors[provider]) {
          connectors[provider] = {
            operations: info.operations ?? [],
            operation_count: info.operation_count ?? 0,
          };
        }
      }
    }
  }

  return {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    connector_count: Object.keys(connectors).length,
    connectors,
  };
}

/**
 * Write a manifest to a JSON file.
 */
export function writeManifest(
  manifest: ConnectorManifest,
  outputPath: string
): void {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(
    `✅ Generated manifest with ${manifest.connector_count} connectors → ${outputPath}`
  );

  // Print summary
  const totalOps = Object.values(manifest.connectors).reduce(
    (sum, c) => sum + c.operation_count,
    0
  );
  console.log(`   Total operations: ${totalOps}`);
  for (const [provider, entry] of Object.entries(manifest.connectors)) {
    console.log(`   - ${provider}: ${entry.operation_count} operations`);
  }
}

/**
 * Read and parse an existing manifest file.
 */
export function readManifest(manifestPath: string): ConnectorManifest | null {
  try {
    const content = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(content) as ConnectorManifest;
  } catch {
    return null;
  }
}

/**
 * Merge two manifests (useful for combining Python-generated and TS-generated manifests).
 */
export function mergeManifests(
  base: ConnectorManifest,
  overlay: ConnectorManifest
): ConnectorManifest {
  const mergedConnectors = { ...base.connectors };

  for (const [provider, entry] of Object.entries(overlay.connectors)) {
    if (!mergedConnectors[provider]) {
      mergedConnectors[provider] = entry;
    } else {
      // Merge operations (overlay takes precedence for duplicates)
      const existingOps = new Set(
        mergedConnectors[provider].operations.map((op) => op.name)
      );
      for (const op of entry.operations) {
        if (existingOps.has(op.name)) {
          // Replace existing operation
          mergedConnectors[provider].operations = mergedConnectors[provider].operations.map(
            (existing) => (existing.name === op.name ? op : existing)
          );
        } else {
          mergedConnectors[provider].operations.push(op);
        }
      }
      mergedConnectors[provider].operation_count =
        mergedConnectors[provider].operations.length;
    }
  }

  return {
    version: base.version,
    generated_at: new Date().toISOString(),
    connector_count: Object.keys(mergedConnectors).length,
    connectors: mergedConnectors,
  };
}
