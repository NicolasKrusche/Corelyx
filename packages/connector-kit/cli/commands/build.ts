// ─── corelyx connector build ────────────────────────────────────────────────
// Scans connector files and generates connectors.manifest.json.
// Compatible with the existing manifest format at packages/schema/connectors.manifest.json.

import * as fs from "node:fs";
import * as path from "node:path";

interface BuildArgs {
  directory?: string;
  output?: string;
  merge?: boolean;
  help?: boolean;
}

function parseArgs(args: string[]): BuildArgs {
  const parsed: BuildArgs = {};
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--directory" || arg === "-d") {
      parsed.directory = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      parsed.output = args[++i];
    } else if (arg === "--merge" || arg === "-m") {
      parsed.merge = true;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    }
  }
  return parsed;
}

const BUILD_HELP = `
Usage: corelyx connector build [options]

Options:
  --directory, -d   Directory to scan for connectors [default: connectors/custom]
  --output, -o      Output path for manifest [default: packages/schema/connectors.manifest.json]
  --merge, -m       Merge with existing manifest (preserve built-in connectors)
  --help, -h        Show this help message

Examples:
  corelyx connector build
  corelyx connector build --directory ./my-connectors --output ./my-manifest.json
  corelyx connector build --merge
`;

interface ConnectorModule {
  default?: {
    provider?: string;
    display_name?: string;
    description?: string;
    operations?: Array<{
      name: string;
      description?: string;
      input?: { _def?: unknown };
    }>;
  };
  [key: string]: unknown;
}

function findConnectorFiles(directory: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(directory)) {
    return files;
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      // Recurse into subdirectories
      files.push(...findConnectorFiles(fullPath));
    }
  }

  return files;
}

function extractConnectorFromSource(filePath: string): {
  provider: string;
  operations: Array<{
    name: string;
    description: string;
    input_fields: Array<{ name: string; kind: string; required: boolean; description: string }>;
  }>;
} | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract provider name from defineConnector({ provider: "..." })
    const providerMatch = content.match(/provider:\s*["']([^"']+)["']/);
    if (!providerMatch) return null;

    const provider = providerMatch[1];

    // Extract operation names from { name: "..." }
    const operationMatches = [...content.matchAll(/name:\s*["']([a-z][a-z0-9_]*)["']/g)];
    const operationNames = [...new Set(operationMatches.map((m) => m[1]))];

    // Extract descriptions
    const descMatches = [...content.matchAll(/name:\s*["']([a-z][a-z0-9_]*)["'][\s\S]*?description:\s*["']([^"']+)["']/g)];
    const descMap = new Map(descMatches.map((m) => [m[1], m[2]]));

    const operations = operationNames.map((name) => ({
      name,
      description: descMap.get(name) || "",
      input_fields: [], // Will be populated at runtime
    }));

    return { provider, operations };
  } catch {
    return null;
  }
}

interface ExistingManifest {
  version: string;
  generated_at: string;
  connector_count: number;
  connectors: Record<string, {
    operations: Array<{
      name: string;
      description: string;
      parameters: Array<{ name: string; type: string }>;
    }>;
    operation_count: number;
  }>;
}

function loadExistingManifest(outputPath: string): ExistingManifest | null {
  if (!fs.existsSync(outputPath)) return null;

  try {
    const content = fs.readFileSync(outputPath, "utf-8");
    return JSON.parse(content) as ExistingManifest;
  } catch {
    return null;
  }
}

function buildManifestFromConnectors(
  connectorFiles: string[],
  existingManifest: ExistingManifest | null,
  merge: boolean,
): ExistingManifest {
  const connectors: Record<string, {
    operations: Array<{
      name: string;
      description: string;
      parameters: Array<{ name: string; type: string }>;
    }>;
    operation_count: number;
  }> = {};

  // Start with existing manifest if merging
  if (merge && existingManifest) {
    Object.assign(connectors, existingManifest.connectors);
  }

  // Scan and add custom connectors
  for (const file of connectorFiles) {
    const connector = extractConnectorFromSource(file);
    if (!connector) continue;

    const operations = connector.operations.map((op) => ({
      name: op.name,
      description: op.description,
      parameters: [
        { name: "operation", type: "str" },
        { name: "params", type: "dict[str, Any]" },
        { name: "access_token", type: "str" },
        ...op.input_fields.map((f) => ({
          name: f.name,
          type: f.kind,
        })),
      ],
    }));

    connectors[connector.provider] = {
      operations,
      operation_count: operations.length,
    };
  }

  return {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    connector_count: Object.keys(connectors).length,
    connectors,
  };
}

export async function runBuild(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(BUILD_HELP);
    return;
  }

  const directory = parsed.directory ?? path.join("connectors", "custom");
  const outputPath = parsed.output ?? path.join("packages", "schema", "connectors.manifest.json");
  const merge = parsed.merge ?? false;

  console.log(`Scanning for connectors in: ${directory}`);

  // Find connector files
  const connectorFiles = findConnectorFiles(directory);

  if (connectorFiles.length === 0) {
    console.log("No connector files found.");
    console.log("Create a connector with: corelyx connector init --provider <name>");
    return;
  }

  console.log(`Found ${connectorFiles.length} connector file(s):`);
  for (const file of connectorFiles) {
    console.log(`  - ${path.relative(process.cwd(), file)}`);
  }

  // Load existing manifest if merging
  const existingManifest = merge ? loadExistingManifest(outputPath) : null;

  // Build manifest
  const manifest = buildManifestFromConnectors(connectorFiles, existingManifest, merge);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write manifest
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

  console.log();
  console.log(`✓ Generated manifest: ${outputPath}`);
  console.log(`  Connectors: ${manifest.connector_count}`);
  console.log(`  Operations: ${Object.values(manifest.connectors).reduce((sum, c) => sum + c.operation_count, 0)}`);

  if (merge && existingManifest) {
    console.log(`  (merged with existing manifest)`);
  }
}
