import { Command } from 'commander';
import { execa } from 'execa';
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

interface DeployOptions {
  environment?: string;
  skipBuild?: boolean;
  skipTests?: boolean;
  dryRun?: boolean;
}

async function checkAuth(): Promise<{ vercel: boolean; supabase: boolean; railway: boolean }> {
  const configPath = join(process.env.HOME || '', '.corelyx', 'config.json');
  if (!existsSync(configPath)) return { vercel: false, supabase: false, railway: false };
  
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  return {
    vercel: !!config.vercelToken,
    supabase: !!config.supabaseAccessToken,
    railway: !!config.railwayToken
  };
}

async function buildWeb(): Promise<void> {
  const spinner = ora('Building Next.js web app...').start();
  try {
    await execa('pnpm', ['--filter', '@flowos/web', 'build'], { 
      cwd: PROJECT_ROOT, 
      stdio: 'pipe' 
    });
    spinner.succeed('Web app built successfully');
  } catch (error) {
    spinner.fail('Web build failed');
    throw error;
  }
}

async function deployVercel(environment: string, dryRun: boolean): Promise<string> {
  const spinner = ora(`Deploying to Vercel (${environment})...`).start();
  try {
    const args = ['--prod', '--token=${VERCEL_TOKEN}'];
    if (dryRun) args.unshift('--dry-run');
    
    const { stdout } = await execa('vercel', args, { 
      cwd: join(PROJECT_ROOT, 'apps/web'),
      stdio: 'pipe',
      env: { ...process.env, VERCEL_TOKEN: process.env.VERCEL_TOKEN }
    });
    
    const urlMatch = stdout.match(/https:\/\/[\w-]+\.vercel\.app/);
    const url = urlMatch ? urlMatch[0] : 'unknown';
    spinner.succeed(`Vercel deployed: ${url}`);
    return url;
  } catch (error) {
    spinner.fail('Vercel deployment failed');
    throw error;
  }
}

async function pushSupabaseMigrations(projectRef: string, dryRun: boolean): Promise<void> {
  const spinner = ora('Pushing Supabase migrations...').start();
  try {
    const args = ['db', 'push', '--project-ref', projectRef];
    if (dryRun) args.push('--dry-run');
    
    await execa('supabase', args, { 
      cwd: PROJECT_ROOT, 
      stdio: 'pipe',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN }
    });
    spinner.succeed('Supabase migrations pushed');
  } catch (error) {
    spinner.fail('Supabase push failed');
    throw error;
  }
}

async function deployRailway(service: string, dryRun: boolean): Promise<string> {
  const spinner = ora(`Deploying ${service} to Railway...`).start();
  try {
    const args = ['up', '--service', service];
    if (dryRun) args.push('--dry-run');
    
    const { stdout } = await execa('railway', args, { 
      cwd: PROJECT_ROOT, 
      stdio: 'pipe',
      env: { ...process.env, RAILWAY_TOKEN: process.env.RAILWAY_TOKEN }
    });
    
    const urlMatch = stdout.match(/https:\/\/[\w-]+\.railway\.app/);
    const url = urlMatch ? urlMatch[0] : 'unknown';
    spinner.succeed(`Railway ${service} deployed: ${url}`);
    return url;
  } catch (error) {
    spinner.fail(`Railway ${service} deployment failed`);
    throw error;
  }
}

async function deployInngest(environment: string, dryRun: boolean): Promise<void> {
  const spinner = ora(`Deploying Inngest (${environment})...`).start();
  try {
    const args = ['deploy', '--env', environment];
    if (dryRun) args.push('--dry-run');
    
    await execa('inngest', args, { 
      cwd: PROJECT_ROOT, 
      stdio: 'pipe',
      env: { ...process.env, INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY }
    });
    spinner.succeed('Inngest deployed');
  } catch (error) {
    spinner.fail('Inngest deployment failed');
    throw error;
  }
}

async function printDeploySummary(urls: Record<string, string>): Promise<void> {
  console.log('\n' + chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log(chalk.bold.cyan('  Corelyx Production Deployment Complete'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════\n'));
  
  console.log(chalk.bold('Deployment URLs:'));
  for (const [service, url] of Object.entries(urls)) {
    console.log(`  ${chalk.cyan(service)}: ${chalk.cyan.underline(url)}`);
  }
  console.log();
  
  console.log(chalk.bold('Next Steps:'));
  console.log(`  ${chalk.cyan('1.')} Configure DNS for custom domain in Vercel`);
  console.log(`  ${chalk.cyan('2.')} Set up Supabase auth providers in dashboard`);
  console.log(`  ${chalk.cyan('3.')} Configure Inngest sync in Vercel dashboard`);
  console.log(`  ${chalk.cyan('4.')} Run smoke tests: ${chalk.cyan('corelyx programs test --production')}\n`);
}

export async function deployCommand(options: DeployOptions): Promise<void> {
  console.log(chalk.bold.cyan('\n🚀 Deploying Corelyx to Production\n'));
  
  // Check auth
  const spinner = ora('Checking authentication...').start();
  const auth = await checkAuth();
  
  if (!auth.vercel || !auth.supabase || !auth.railway) {
    spinner.fail('Missing authentication. Run `corelyx login` first.');
    console.log(chalk.gray('Required: Vercel token, Supabase access token, Railway token'));
    process.exit(1);
  }
  spinner.succeed('Authentication verified');
  
  // Load config
  const configPath = join(process.env.HOME || '', '.corelyx', 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  
  // Build web app
  if (!options.skipBuild) {
    await buildWeb();
  }
  
  // Deploy to Vercel
  const webUrl = await deployVercel(options.environment || 'production', options.dryRun || false);
  
  // Push Supabase migrations
  await pushSupabaseMigrations(config.supabaseProjectRef, options.dryRun || false);
  
  // Deploy runtime to Railway
  const runtimeUrl = await deployRailway('runtime', options.dryRun || false);
  
  // Deploy Inngest
  await deployInngest(options.environment || 'production', options.dryRun || false);
  
  // Print summary
  await printDeploySummary({
    'Web (Vercel)': webUrl,
    'Runtime (Railway)': runtimeUrl,
    'Database (Supabase)': `https://supabase.com/dashboard/project/${config.supabaseProjectRef}`,
    'Inngest': `https://app.inngest.com/environments/${options.environment || 'production'}`
  });
  
  if (options.dryRun) {
    console.log(chalk.yellow('\n⚠ This was a dry run. No actual deployments were made.\n'));
  }
}

const deployCommand = new Command('deploy')
  .description('Deploy Corelyx to production (Vercel + Supabase + Railway + Inngest)')
  .option('-e, --environment <env>', 'Target environment', 'production')
  .option('--skip-build', 'Skip web app build')
  .option('--skip-tests', 'Skip post-deploy tests')
  .option('--dry-run', 'Simulate deployment without making changes')
  .action(deployCommand);

export { deployCommand };