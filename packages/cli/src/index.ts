#!/usr/bin/env node
import { Command } from 'commander';
import { devCommand } from './commands/dev.js';
import { deployCommand } from './commands/deploy.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { programsCommand } from './commands/programs/index.js';
import { nodesCommand } from './commands/nodes/index.js';
import { version } from '../package.json';

const program = new Command()
  .name('corelyx')
  .description('Corelyx CLI — Build, test, deploy agentic workflows')
  .version(version)
  .addHelpText('after', `
Examples:
  $ corelyx dev                    # Start local dev stack (Docker Compose)
  $ corelyx deploy                 # Deploy to production (Vercel + Supabase + Railway)
  $ corelyx login                  # Login to Corelyx Cloud
  $ corelyx whoami                 # Show current user
  $ corelyx programs list          # List programs
  $ corelyx nodes create           # Scaffold a new connector/node
  $ corelyx nodes build            # Build a connector for publishing
  $ corelyx nodes publish          # Publish connector to registry`);

program.addCommand(devCommand);
program.addCommand(deployCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(programsCommand);
program.addCommand(nodesCommand);

program.parseAsync(process.argv).catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});