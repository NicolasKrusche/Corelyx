import { Command } from 'commander';
import { devCommand } from './commands/dev';
import { deployCommand } from './commands/deploy';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { whoamiCommand } from './commands/whoami';
import { programsExportCommand } from './commands/programs/export';
import { programsImportCommand } from './commands/programs/import';
import { programsListCommand } from './commands/programs/list';
import { programsRunCommand } from './commands/programs/run';
import { programsStreamCommand } from './commands/programs/stream';
import { nodesCreateCommand } from './commands/nodes/create';
import { nodesBuildCommand } from './commands/nodes/build';
import { nodesPublishCommand } from './commands/nodes/publish';

const program = new Command();

program
  .name('corelyx')
  .description('Corelyx CLI — Build, test, deploy agentic workflows')
  .version('0.1.0');

program.addCommand(devCommand);
program.addCommand(deployCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);

// Programs subcommands
const programs = new Command('programs');
programs
  .description('Manage Corelyx programs')
  .addCommand(programsExportCommand)
  .addCommand(programsImportCommand)
  .addCommand(programsListCommand)
  .addCommand(programsRunCommand)
  .addCommand(programsStreamCommand);
program.addCommand(programs);

// Nodes subcommands
const nodes = new Command('nodes');
nodes
  .description('Manage Corelyx nodes/connectors')
  .addCommand(nodesCreateCommand)
  .addCommand(nodesBuildCommand)
  .addCommand(nodesPublishCommand);
program.addCommand(nodes);

program.parse(process.argv);