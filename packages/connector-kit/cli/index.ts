#!/usr/bin/env node
// ─── corelyx connector CLI ──────────────────────────────────────────────────
// CLI tool for scaffolding, building, and testing custom connectors.
//
// Commands:
//   corelyx connector init     — scaffold a new connector from template
//   corelyx connector build    — scan connector files, generate manifest
//   corelyx connector test     — run connector tests with schema validation

import { runInit } from "./commands/init.js";
import { runBuild } from "./commands/build.js";
import { runTest } from "./commands/test.js";

const args = process.argv.slice(2);
const command = args[0];

const HELP = `
@flowos/connector-kit CLI

Usage:
  corelyx connector <command> [options]

Commands:
  init      Scaffold a new connector from template
  build     Scan connector files and generate connectors.manifest.json
  test      Run connector tests with schema validation
  help      Show this help message

Examples:
  corelyx connector init --provider myapi --auth-type bearer
  corelyx connector build --directory ./connectors/custom
  corelyx connector test --provider myapi
`;

async function main() {
  switch (command) {
    case "init":
      await runInit(args.slice(1));
      break;
    case "build":
      await runBuild(args.slice(1));
      break;
    case "test":
      await runTest(args.slice(1));
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${command}\n${HELP}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
