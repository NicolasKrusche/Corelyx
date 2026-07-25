import { Command } from 'commander';
import { execa } from 'execa';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs-extra';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_DIR = join(process.env.HOME || '', '.corelyx');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface AuthConfig {
  vercelToken?: string;
  supabaseAccessToken?: string;
  railwayToken?: string;
  supabaseProjectRef?: string;
  vercelOrgId?: string;
  vercelProjectId?: string;
  email?: string;
  userId?: string;
}

function loadConfig(): AuthConfig {
  if (!existsSync(CONFIG_FILE)) return {};
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

function saveConfig(config: AuthConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function verifyVercelToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { stdout } = await execa('vercel', ['whoami', '--token', token], { stdio: 'pipe' });
    const email = stdout.trim();
    const { stdout: userId } = await execa('vercel', ['whoami', '--token', token, '--format=json'], { stdio: 'pipe' });
    return { userId: JSON.parse(userId).id, email };
  } catch {
    return null;
  }
}

async function verifySupabaseToken(token: string): Promise<{ projectRef: string } | null> {
  try {
    const { stdout } = await execa('supabase', ['projects', 'list', '--access-token', token], { stdio: 'pipe' });
    // Parse output to get project ref
    return { projectRef: 'default' };
  } catch {
    return null;
  }
}

async function verifyRailwayToken(token: string): Promise<boolean> {
  try {
    await execa('railway', ['whoami'], { 
      stdio: 'pipe', 
      env: { ...process.env, RAILWAY_TOKEN: token } 
    });
    return true;
  } catch {
    return false;
  }
}

export async function loginCommand(options: { provider?: string }): Promise<void> {
  console.log(chalk.bold.cyan('\n🔐 Corelyx Cloud Login\n'));
  
  const config = loadConfig();
  const providers = options.provider ? [options.provider] : ['vercel', 'supabase', 'railway'];
  
  for (const provider of providers) {
    console.log(chalk.bold(`\n--- ${provider.toUpperCase()} ---`));
    
    switch (provider) {
      case 'vercel': {
        const { token } = await prompts({
          type: 'password',
          name: 'token',
          message: 'Enter Vercel token (create at vercel.com/account/tokens):',
          validate: v => v.length > 0 || 'Token required'
        });
        
        const spinner = ora('Verifying Vercel token...').start();
        const verified = await verifyVercelToken(token);
        if (!verified) {
          spinner.fail('Invalid Vercel token');
          process.exit(1);
        }
        spinner.succeed(`Logged in as ${verified.email}`);
        config.vercelToken = token;
        config.email = verified.email;
        config.userId = verified.userId;
        break;
      }
      
      case 'supabase': {
        const { token } = await prompts({
          type: 'password',
          name: 'token',
          message: 'Enter Supabase access token (from supabase.com/dashboard/account/tokens):',
          validate: v => v.length > 0 || 'Token required'
        });
        
        const { projectRef } = await prompts({
          type: 'text',
          name: 'projectRef',
          message: 'Supabase Project Ref (found in project settings):',
          validate: v => v.length > 0 || 'Project ref required'
        });
        
        const spinner = ora('Verifying Supabase token...').start();
        const verified = await verifySupabaseToken(token);
        if (!verified) {
          spinner.fail('Invalid Supabase token');
          process.exit(1);
        }
        spinner.succeed('Supabase verified');
        config.supabaseAccessToken = token;
        config.supabaseProjectRef = projectRef;
        break;
      }
      
      case 'railway': {
        const { token } = await prompts({
          type: 'password',
          name: 'token',
          message: 'Enter Railway token (from railway.app/account/tokens):',
          validate: v => v.length > 0 || 'Token required'
        });
        
        const spinner = ora('Verifying Railway token...').start();
        const verified = await verifyRailwayToken(token);
        if (!verified) {
          spinner.fail('Invalid Railway token');
          process.exit(1);
        }
        spinner.succeed('Railway verified');
        config.railwayToken = token;
        break;
      }
    }
  }
  
  saveConfig(config);
  console.log(chalk.green('\n✓ Login successful! Configuration saved to ~/.corelyx/config.json\n'));
}

const loginCommandObj = new Command('login')
  .description('Login to Corelyx Cloud (Vercel + Supabase + Railway)')
  .option('-p, --provider <provider>', 'Specific provider to login (vercel|supabase|railway)')
  .action(loginCommand);

export { loginCommandObj as loginCommand };