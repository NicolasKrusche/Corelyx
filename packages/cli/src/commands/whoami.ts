import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs-extra';
import { join } from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_DIR = join(process.env.HOME || '', '.corelyx');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function loadConfig(): Record<string, any> {
  if (!existsSync(CONFIG_FILE)) return {};
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

function saveConfig(config: Record<string, any>): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function whoamiCommand(): Promise<void> {
  console.log(chalk.bold.cyan('\n👤 Corelyx Cloud Identity\n'));
  
  const config = loadConfig();
  
  if (!config.email) {
    console.log(chalk.yellow('Not logged in. Run `corelyx login` to authenticate.\n'));
    return;
  }
  
  console.log(chalk.bold('User:'), chalk.cyan(config.email));
  console.log(chalk.bold('User ID:'), chalk.cyan(config.userId));
  console.log('');
  
  console.log(chalk.bold('Providers:'));
  if (config.vercelToken) {
    console.log(`  ${chalk.green('✓')} Vercel (Org: ${config.vercelOrgId || 'unknown'}, Project: ${config.vercelProjectId || 'unknown'})`);
  } else {
    console.log(`  ${chalk.red('✗')} Vercel`);
  }
  
  if (config.supabaseAccessToken) {
    console.log(`  ${chalk.green('✓')} Supabase (Project: ${config.supabaseProjectRef || 'unknown'})`);
  } else {
    console.log(`  ${chalk.red('✗')} Supabase`);
  }
  
  if (config.railwayToken) {
    console.log(`  ${chalk.green('✓')} Railway`);
  } else {
    console.log(`  ${chalk.red('✗')} Railway`);
  }
  
  console.log('');
}

const whoamiCommandObj = new Command('whoami')
  .description('Show current Corelyx Cloud identity')
  .action(whoamiCommand);

export { whoamiCommandObj as whoamiCommand };