import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs-extra';
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

export async function logoutCommand(options: { provider?: string }): Promise<void> {
  console.log(chalk.bold.cyan('\n🚪 Corelyx Cloud Logout\n'));
  
  const config = loadConfig();
  const providers = options.provider ? [options.provider] : ['vercel', 'supabase', 'railway'];
  
  for (const provider of providers) {
    const key = `${provider}Token`;
    if (config[key]) {
      delete config[key];
      console.log(chalk.green(`✓ Logged out from ${provider}`));
    } else {
      console.log(chalk.gray(`  Already logged out from ${provider}`));
    }
  }
  
  // Clean up user info if all providers logged out
  const remainingTokens = ['vercelToken', 'supabaseAccessToken', 'railwayToken']
    .filter(k => config[k]);
  
  if (remainingTokens.length === 0) {
    delete config.email;
    delete config.userId;
    delete config.supabaseProjectRef;
    delete config.vercelOrgId;
    delete config.vercelProjectId;
  }
  
  saveConfig(config);
  console.log(chalk.green('\n✓ Logout complete\n'));
}

const logoutCommand = new Command('logout')
  .description('Logout from Corelyx Cloud providers')
  .option('-p, --provider <provider>', 'Specific provider to logout (vercel|supabase|railway)')
  .action(logoutCommand);

export { logoutCommand };