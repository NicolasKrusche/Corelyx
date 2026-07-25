import { Command } from 'commander';
import { execa, execaSync } from 'execa';
import { existsSync, readFileSync, writeFileSync } from 'fs-extra';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../../..');

interface DevOptions {
  detached?: boolean;
  profile?: string[];
  noSupabase?: boolean;
  noInngest?: boolean;
  noRuntime?: boolean;
  noWeb?: boolean;
  noLiteLLM?: boolean;
  seed?: boolean;
}

function checkPrerequisites(): { docker: boolean; pnpm: boolean; supabase: boolean } {
  const checks = { docker: false, pnpm: false, supabase: false };
  
  try { execaSync('docker', ['--version']); checks.docker = true; } catch {}
  try { execaSync('pnpm', ['--version']); checks.pnpm = true; } catch {}
  try { execaSync('supabase', ['--version']); checks.supabase = true; } catch {}
  
  return checks;
}

function checkDockerCompose(): boolean {
  try {
    execaSync('docker', ['compose', 'version']);
    return true;
  } catch {
    try { execaSync('docker-compose', ['--version']); return true; } catch {}
  }
  return false;
}

async function generateEnvLocal(): Promise<void> {
  const envExamplePath = join(PROJECT_ROOT, '.env.example');
  const envLocalPath = join(PROJECT_ROOT, '.env.local');
  
  if (!existsSync(envExamplePath)) {
    console.log(chalk.yellow('⚠ .env.example not found, skipping .env.local generation'));
    return;
  }
  
  if (existsSync(envLocalPath)) {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: '.env.local already exists. Overwrite?',
      initial: false
    });
    if (!overwrite) return;
  }
  
  let envContent = readFileSync(envExamplePath, 'utf-8');
  
  // Generate Supabase local keys
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
  
  envContent = envContent
    .replace(/^NEXT_PUBLIC_SUPABASE_URL=.*$/m, 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321')
    .replace(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*$/m, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`)
    .replace(/^SUPABASE_SERVICE_ROLE_KEY=.*$/m, `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`)
    .replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres')
    .replace(/^NEXT_PUBLIC_APP_URL=.*$/m, 'NEXT_PUBLIC_APP_URL=http://localhost:3000')
    .replace(/^NEXT_PUBLIC_RUNTIME_URL=.*$/m, 'NEXT_PUBLIC_RUNTIME_URL=http://localhost:8002')
    .replace(/^RUNTIME_URL=.*$/m, 'RUNTIME_URL=http://localhost:8002')
    .replace(/^RUNTIME_INTERNAL_URL=.*$/m, 'RUNTIME_INTERNAL_URL=http://localhost:8002')
    .replace(/^INNGEST_SIGNING_KEY=.*$/m, 'INNGEST_SIGNING_KEY=signkey-dev')
    .replace(/^INNGEST_EVENT_KEY=.*$/m, 'INNGEST_EVENT_KEY=eventkey-dev')
    .replace(/^INTERNAL_SERVICE_AUTH_SECRET_WEB_TO_RUNTIME=.*$/m, 'INTERNAL_SERVICE_AUTH_SECRET_WEB_TO_RUNTIME=dev-secret-change-in-production');
  
  writeFileSync(envLocalPath, envContent);
  console.log(chalk.green('✓ Generated .env.local from .env.example with local Supabase keys'));
}

async function startSupabase(): Promise<void> {
  const spinner = ora('Starting Supabase local...').start();
  try {
    await execa('supabase', ['start'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
    spinner.succeed('Supabase local started');
  } catch (error) {
    spinner.fail('Failed to start Supabase local');
    throw error;
  }
}

async function runMigrations(): Promise<void> {
  const spinner = ora('Running Supabase migrations...').start();
  try {
    await execa('supabase', ['db', 'reset'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
    spinner.succeed('Migrations applied');
  } catch (error) {
    spinner.fail('Failed to run migrations');
    throw error;
  }
}

async function startDockerCompose(profile?: string[], options?: DevOptions): Promise<void> {
  const composeFile = join(PROJECT_ROOT, 'docker-compose.dev.yml');
  const args = ['-f', composeFile, 'up'];
  
  if (options?.detached) args.push('-d');
  
  if (profile && profile.length > 0) {
    for (const p of profile) {
      args.push('--profile', p);
    }
  }
  
  // Add profiles based on options
  if (options?.noLiteLLM === false) {
    args.push('--profile', 'litellm');
  }
  if (options?.seed) {
    args.push('--profile', 'seed');
  }
  
  const spinner = ora(`Starting Docker Compose stack...`).start();
  
  try {
    const subprocess = execa('docker', ['compose', ...args], {
      cwd: PROJECT_ROOT,
      stdio: options?.detached ? 'ignore' : 'inherit'
    });
    
    if (options?.detached) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      spinner.succeed('Docker Compose stack started in background');
    } else {
      spinner.stop();
      await subprocess;
    }
  } catch (error) {
    spinner.fail('Docker Compose failed');
    throw error;
  }
}

async function printSummary(): Promise<void> {
  console.log('\n' + chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log(chalk.bold.cyan('  Corelyx Local Dev Stack Running'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════\n'));
  
  console.log(chalk.bold('Services:'));
  console.log(`  ${chalk.cyan('Web (Next.js)')}:        ${chalk.cyan.underline('http://localhost:3000')}`);
  console.log(`  ${chalk.cyan('Runtime (FastAPI)')}:     ${chalk.cyan.underline('http://localhost:8002')}`);
  console.log(`  ${chalk.cyan('Runtime API Docs')}:      ${chalk.cyan.underline('http://localhost:8002/docs')}`);
  console.log(`  ${chalk.cyan('Inngest Dev Server')}:    ${chalk.cyan.underline('http://localhost:8288')}`);
  console.log(`  ${chalk.cyan('Supabase Studio')}:       ${chalk.cyan.underline('http://localhost:54323')}`);
  console.log(`  ${chalk.cyan('PostgreSQL')}:             ${chalk.cyan.underline('postgresql://postgres:postgres@localhost:54322/postgres')}`);
  console.log(`  ${chalk.cyan('LiteLLM Proxy (profile)')}: ${chalk.cyan.underline('http://localhost:4000')}`);
  console.log(`  ${chalk.cyan('Redis')}:                  ${chalk.cyan.underline('redis://localhost:6379')}\n`);
  
  console.log(chalk.bold('Hot Reload:'));
  console.log(`  ${chalk.green('✓')} Web (Next.js) — turbopack`);
  console.log(`  ${chalk.green('✓')} Runtime (FastAPI) — uvicorn --reload`);
  console.log(`  ${chalk.green('✓')} Supabase — schema changes via migrations\n`);
  
  console.log(chalk.bold('Commands:'));
  console.log(`  ${chalk.cyan('corelyx dev --detached')}  Run in background`);
  console.log(`  ${chalk.cyan('docker compose -f docker-compose.dev.yml logs -f')}  View logs`);
  console.log(`  ${chalk.cyan('docker compose -f docker-compose.dev.yml down')}   Stop all\n`);
}

export async function devCommand(options: DevOptions): Promise<void> {
  console.log(chalk.bold.cyan('\n🚀 Starting Corelyx Local Dev Stack\n'));
  
  // Check prerequisites
  const spinner = ora('Checking prerequisites...').start();
  const checks = checkPrerequisites();
  const hasDockerCompose = checkDockerCompose();
  
  if (!checks.docker) {
    spinner.fail('Docker not found. Please install Docker Desktop.');
    process.exit(1);
  }
  if (!hasDockerCompose) {
    spinner.fail('Docker Compose not found. Please install Docker Compose.');
    process.exit(1);
  }
  if (!checks.pnpm) {
    spinner.warn('pnpm not found. Will use npx for Node commands.');
  }
  if (!checks.supabase) {
    spinner.warn('Supabase CLI not found. Will use Docker Compose for Supabase.');
  }
  spinner.succeed('Prerequisites checked');
  
  // Generate .env.local
  await generateEnvLocal();
  
  // Start Supabase if available
  if (checks.supabase && !options.noSupabase) {
    await startSupabase();
    await runMigrations();
  }
  
  // Start Docker Compose stack
  const profiles: string[] = [];
  if (options.profile) profiles.push(...options.profile);
  
  await startDockerCompose(profiles.length > 0 ? profiles : undefined, options);
  
  if (!options.detached) {
    await printSummary();
  } else {
    console.log(chalk.green('\n✓ Dev stack started in background'));
    console.log(chalk.gray('Run `docker compose -f docker-compose.dev.yml logs -f` to view logs'));
    console.log(chalk.gray('Run `docker compose -f docker-compose.dev.yml down` to stop\n'));
  }
}

const devCommand = new Command('dev')
  .description('Start full local development stack (Next.js + Supabase + LangGraph + Inngest + LiteLLM)')
  .option('-d, --detached', 'Run in background (detached mode)')
  .option('-p, --profile <profiles...>', 'Docker Compose profiles to enable (litellm, seed)')
  .option('--no-supabase', 'Skip Supabase local startup')
  .option('--no-inngest', 'Skip Inngest dev server')
  .option('--no-runtime', 'Skip LangGraph runtime')
  .option('--no-web', 'Skip Next.js web app')
  .option('--no-litellm', 'Skip LiteLLM proxy')
  .option('--seed', 'Run database seed after startup')
  .action(devCommand);

export { devCommand };