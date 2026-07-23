#!/usr/bin/env node
/**
 * @flowos/connector-sdk — CLI
 *
 * Command-line interface for building connectors:
 *   corelyx-connector init       — Scaffold a new connector package
 *   corelyx-connector test       — Run connector tests
 *   corelyx-connector build      — Build the connector
 *   corelyx-connector generate-manifest — Generate connectors.manifest.json
 *
 * Usage:
 *   npx corelyx-connector <command> [options]
 *   pnpm --filter @flowos/connector-sdk connector:<command>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import {
  generateConnectorManifest,
  writeManifest,
} from "../manifest.js";

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

// ─── Commands ────────────────────────────────────────────────────────────────

const HELP = `
@flowos/connector-sdk CLI

Usage:
  corelyx-connector <command> [options]

Commands:
  init <name>              Scaffold a new connector package
  test [options]           Run connector tests
  build [options]          Build the connector package
  generate-manifest        Generate connectors.manifest.json

Options:
  --root <dir>             Root directory (default: cwd)
  --output <path>          Output path for manifest
  --help, -h               Show this help message
`;

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  switch (command) {
    case "init":
      await handleInit(args.slice(1));
      break;
    case "test":
      await handleTest(args.slice(1));
      break;
    case "build":
      await handleBuild(args.slice(1));
      break;
    case "generate-manifest":
      await handleGenerateManifest(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

// ─── Init Command ────────────────────────────────────────────────────────────

async function handleInit(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("Usage: corelyx-connector init <connector-name>");
    process.exit(1);
  }

  const connectorDir = path.resolve(process.cwd(), "connectors", name);
  if (fs.existsSync(connectorDir)) {
    console.error(`Connector directory already exists: ${connectorDir}`);
    process.exit(1);
  }

  fs.mkdirSync(connectorDir, { recursive: true });

  // Generate connector.ts
  const connectorContent = `/**
 * ${name} connector for Corelyx.
 *
 * This connector was scaffolded by the Connector SDK.
 * Edit the operations below to add your API integrations.
 */

import {
  BaseConnector,
  AuthType,
  FieldKind,
  operation,
  field,
  createHandler,
  type OperationSchema,
  type OperationContext,
  type OperationResult,
} from "@flowos/connector-sdk";

/**
 * ${name} connector implementation.
 */
class ${capitalize(name)}Connector extends BaseConnector {
  provider = "${name}";
  displayName = "${capitalize(name)}";
  baseUrl = "https://api.${name}.com/v1"; // TODO: Update this
  authType = AuthType.BEARER; // TODO: Update auth type

  protected setupHandlers(): void {
    this.handlers.register(
      createHandler(
        {
          name: "list_items",
          description: "List all items",
          inputFields: [
            field("limit").kind(FieldKind.INTEGER).default(10).build(),
          ],
          outputFields: [
            field("items").kind(FieldKind.ARRAY).build(),
          ],
        },
        async (ctx: OperationContext) => {
          // TODO: Implement API call
          const response = await fetch(
            \`\${ctx.baseUrl}/items?limit=\${ctx.params.limit ?? 10}\`,
            ctx.auth.apply({ method: "GET" })
          );
          const data = await response.json();
          return { data: { items: data.items ?? [] } };
        }
      )
    );

    this.handlers.register(
      createHandler(
        {
          name: "get_item",
          description: "Get a single item by ID",
          inputFields: [
            field("item_id").kind(FieldKind.STRING).required().description("The item ID"),
          ],
          outputFields: [
            field("item").kind(FieldKind.OBJECT).build(),
          ],
        },
        async (ctx: OperationContext) => {
          const { item_id } = ctx.params as { item_id: string };
          const response = await fetch(
            \`\${ctx.baseUrl}/items/\${item_id}\`,
            ctx.auth.apply({ method: "GET" })
          );
          const data = await response.json();
          return { data: { item: data } };
        }
      )
    );
  }
}

export default new ${capitalize(name)}Connector();
`;

  fs.writeFileSync(path.join(connectorDir, "connector.ts"), connectorContent);

  // Generate connector.test.ts
  const testContent = `/**
 * Tests for the ${name} connector.
 */

import { describe, it, expect } from "vitest";
import connector from "./connector.js";

describe("${name} connector", () => {
  it("has correct provider", () => {
    expect(connector.provider).toBe("${name}");
  });

  it("has supported operations", () => {
    expect(connector.supportedOperations).toContain("list_items");
    expect(connector.supportedOperations).toContain("get_item");
  });

  it("has operation schemas", () => {
    expect(connector.operationSchemas.length).toBeGreaterThan(0);
  });

  it("returns info", () => {
    const info = connector.info();
    expect(info.provider).toBe("${name}");
    expect(info.baseUrl).toBeDefined();
  });
});
`;

  fs.writeFileSync(path.join(connectorDir, "connector.test.ts"), testContent);

  // Generate package.json
  const pkgJson = {
    name: `@flowos/connector-${name}`,
    version: "0.1.0",
    private: true,
    type: "module",
    main: "./connector.ts",
    types: "./connector.ts",
    scripts: {
      test: "vitest run",
      "type-check": "tsc --noEmit",
    },
    dependencies: {
      "@flowos/connector-sdk": "workspace:*",
    },
    devDependencies: {
      vitest: "^1.0.0",
      typescript: "^5.4.5",
    },
  };

  fs.writeFileSync(
    path.join(connectorDir, "package.json"),
    JSON.stringify(pkgJson, null, 2)
  );

  // Generate tsconfig.json
  const tsconfig = {
    extends: "../../packages/connector-sdk/tsconfig.json",
    compilerOptions: {
      rootDir: ".",
      outDir: "./dist",
    },
    include: ["./**/*.ts"],
  };

  fs.writeFileSync(
    path.join(connectorDir, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2)
  );

  // Generate README.md
  const readme = `# ${capitalize(name)} Connector

This is a Corelyx connector for ${capitalize(name)}.

## Setup

\`\`\`bash
cd connectors/${name}
pnpm install
\`\`\`

## Configuration

Update the \`baseUrl\` and \`authType\` in \`connector.ts\` to match your API.

## Testing

\`\`\`bash
pnpm test
\`\`\`

## Operations

- \`list_items\` — List all items
- \`get_item\` — Get a single item by ID

## Adding Operations

Edit \`connector.ts\` and add new handlers using the SDK:

\`\`\`typescript
import { createHandler, field, FieldKind } from "@flowos/connector-sdk";

this.handlers.register(
  createHandler(
    {
      name: "create_item",
      description: "Create a new item",
      inputFields: [
        field("name").kind(FieldKind.STRING).required().build(),
      ],
      outputFields: [
        field("item").kind(FieldKind.OBJECT).build(),
      ],
    },
    async (ctx) => {
      // Implementation
    }
  )
);
\`\`\`
`;

  fs.writeFileSync(path.join(connectorDir, "README.md"), readme);

  console.log(`✅ Created connector: ${connectorDir}`);
  console.log(`   Files:`);
  console.log(`   - connector.ts         (implementation)`);
  console.log(`   - connector.test.ts    (tests)`);
  console.log(`   - package.json`);
  console.log(`   - tsconfig.json`);
  console.log(`   - README.md`);
  console.log();
  console.log(`   Next steps:`);
  console.log(`   1. cd connectors/${name}`);
  console.log(`   2. Update baseUrl and authType in connector.ts`);
  console.log(`   3. Implement your API operations`);
  console.log(`   4. Run "pnpm test" to verify`);
}

// ─── Test Command ────────────────────────────────────────────────────────────

async function handleTest(args: string[]): Promise<void> {
  const rootDir = getOption(args, "--root") ?? process.cwd();

  console.log(`🧪 Running connector tests in ${rootDir}...`);

  const { execSync } = await import("node:child_process");
  try {
    execSync("pnpm vitest run", {
      cwd: rootDir,
      stdio: "inherit",
    });
  } catch {
    console.error("❌ Tests failed");
    process.exit(1);
  }
}

// ─── Build Command ───────────────────────────────────────────────────────────

async function handleBuild(args: string[]): Promise<void> {
  const rootDir = getOption(args, "--root") ?? process.cwd();

  console.log(`🔨 Building connector in ${rootDir}...`);

  const { execSync } = await import("node:child_process");
  try {
    execSync("pnpm tsc", {
      cwd: rootDir,
      stdio: "inherit",
    });
    console.log("✅ Build complete");
  } catch {
    console.error("❌ Build failed");
    process.exit(1);
  }
}

// ─── Generate Manifest Command ───────────────────────────────────────────────

async function handleGenerateManifest(args: string[]): Promise<void> {
  const rootDir = getOption(args, "--root") ?? process.cwd();
  const outputPath =
    getOption(args, "--output") ??
    path.join(rootDir, "packages", "schema", "connectors.manifest.json");

  console.log(`📦 Scanning for connectors in ${rootDir}...`);

  const manifest = await generateConnectorManifest({
    rootDir,
    outputPath,
  });

  writeManifest(manifest, outputPath);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOption(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
