import { Command } from 'commander';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs-extra';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import prompts from 'prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../../../..');
const CONNECTORS_DIR = join(PROJECT_ROOT, 'packages/connectors/src');

interface CreateNodeOptions {
  name?: string;
  type?: 'connector' | 'agent' | 'step' | 'trigger';
  operations?: string[];
  auth?: 'oauth2' | 'api_key' | 'bearer' | 'none';
  baseUrl?: string;
  nonInteractive?: boolean;
}

async function createNodeCommand(options: CreateNodeOptions): Promise<void> {
  console.log(chalk.bold.cyan('\n🧩 Corelyx Connector/Node Scaffold\n'));
  
  let config = {
    name: options.name,
    type: options.type,
    operations: options.operations,
    auth: options.auth,
    baseUrl: options.baseUrl
  };
  
  if (options.nonInteractive) {
    if (!config.name || !config.type) {
      console.error(chalk.red('Error: --non-interactive requires --name and --type'));
      process.exit(1);
    }
  } else {
    // Interactive prompts
    if (!config.name) {
      const { name } = await prompts({
        type: 'text',
        name: 'name',
        message: 'Connector name (kebab-case, e.g., "slack", "github-issues"):',
        validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || 'Use kebab-case (lowercase, hyphens only)'
      });
      config.name = name;
    }
    
    if (!config.type) {
      const { type } = await prompts({
        type: 'select',
        name: 'type',
        message: 'Connector type:',
        choices: [
          { title: 'Connector (external API integration)', value: 'connector' },
          { title: 'Agent (AI agent with tools)', value: 'agent' },
          { title: 'Step (custom workflow step)', value: 'step' },
          { title: 'Trigger (event/webhook trigger)', value: 'trigger' }
        ]
      });
      config.type = type;
    }
    
    if (config.type === 'connector' && !config.operations) {
      const { operations } = await prompts({
        type: 'multiselect',
        name: 'operations',
        message: 'Select operations to scaffold:',
        choices: [
          { title: 'Create', value: 'create', selected: true },
          { title: 'Read / Get', value: 'read', selected: true },
          { title: 'Update', value: 'update', selected: true },
          { title: 'Delete', value: 'delete', selected: true },
          { title: 'List', value: 'list', selected: true },
          { title: 'Search', value: 'search', selected: false },
          { title: 'Custom', value: 'custom', selected: false }
        ],
        hint: 'Space to select, Enter to confirm'
      });
      config.operations = operations;
    }
    
    if (config.type === 'connector' && !config.auth) {
      const { auth } = await prompts({
        type: 'select',
        name: 'auth',
        message: 'Authentication type:',
        choices: [
          { title: 'OAuth 2.0', value: 'oauth2' },
          { title: 'API Key', value: 'api_key' },
          { title: 'Bearer Token', value: 'bearer' },
          { title: 'None', value: 'none' }
        ]
      });
      config.auth = auth;
    }
    
    if (config.type === 'connector' && config.auth !== 'none' && !config.baseUrl) {
      const { baseUrl } = await prompts({
        type: 'text',
        name: 'baseUrl',
        message: 'Base API URL (e.g., https://api.slack.com):',
        initial: 'https://api.example.com'
      });
      config.baseUrl = baseUrl;
    }
  }
  
  // Create connector directory
  const connectorDir = join(CONNECTORS_DIR, config.name!);
  if (existsSync(connectorDir)) {
    console.error(chalk.red(`\nError: Connector "${config.name}" already exists at ${connectorDir}`));
    process.exit(1);
  }
  
  mkdirSync(connectorDir, { recursive: true });
  mkdirSync(join(connectorDir, 'tests'), { recursive: true });
  
  // Generate files based on type
  if (config.type === 'connector') {
    await generateConnector(connectorDir, config);
  } else if (config.type === 'agent') {
    await generateAgent(connectorDir, config);
  } else if (config.type === 'step') {
    await generateStep(connectorDir, config);
  } else if (config.type === 'trigger') {
    await generateTrigger(connectorDir, config);
  }
  
  // Update connectors index
  await updateConnectorsIndex(config.name!);
  
  console.log(chalk.green('\n✅ Connector scaffolded successfully!\n'));
  console.log(chalk.bold('Next steps:'));
  console.log(`  cd ${join('packages/connectors/src', config.name!)}`);
  console.log('  pnpm install          # Install dependencies');
  console.log('  pnpm test             # Run tests');
  console.log('  pnpm build            # Build connector\n');
}

async function generateConnector(dir: string, config: any): Promise<void> {
  const { name, operations, auth, baseUrl } = config;
  const className = name!.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  
  // package.json
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `@flowos/connectors-${name}`,
    version: '0.1.0',
    description: `Corelyx connector for ${name}`,
    type: 'module',
    main: './src/index.ts',
    types: './src/index.ts',
    exports: {
      '.': { types: './src/index.ts', default: './src/index.ts' },
      './manifest': { types: './src/manifest.ts', default: './src/manifest.ts' }
    },
    scripts: {
      'type-check': 'tsc --noEmit',
      test: 'vitest run',
      build: 'tsc'
    },
    dependencies: {
      'zod': '^3.23.8',
      '@flowos/connector-sdk': 'workspace:*',
      '@flowos/schema': 'workspace:*'
    },
    devDependencies: {
      '@types/node': '^20.14.0',
      'typescript': '^5.4.5',
      'vitest': '^1.6.0'
    },
    peerDependencies: {},
    files: ['src'],
    license: 'MIT'
  }, null, 2));
  
  // tsconfig.json
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    extends: '../../../tsconfig.base.json',
    compilerOptions: {
      outDir: './dist',
      rootDir: './src',
      declaration: true,
      declarationMap: true,
      sourceMap: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  }, null, 2));
  
  // src/index.ts - Main connector class
  writeFileSync(join(dir, 'src/index.ts'), `import { z } from 'zod';
import { BaseConnector, ConnectorManifest, AuthConfig } from '@flowos/connector-sdk';
import { operations } from './operations.js';
import { authConfig } from './auth.js';

export class ${className}Connector extends BaseConnector {
  static manifest: ConnectorManifest = {
    id: '${name}',
    name: '${className}',
    version: '0.1.0',
    description: 'Corelyx connector for ${name}',
    category: 'productivity',
    auth: authConfig,
    operations: Object.keys(operations).map(key => operations[key].manifest),
    baseUrl: '${baseUrl || 'https://api.example.com'}',
    icon: 'https://cdn.corelyx.app/connectors/${name}.svg',
    docsUrl: 'https://docs.corelyx.app/connectors/${name}',
    tags: ['${name}', 'api']
  };

  constructor(config: Record<string, any>) {
    super('${name}', config);
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      // Implement connection test
      // Example: await this.client.get('/me');
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}

export default ${className}Connector;
`);
  
  // src/operations.ts - Zod schemas for each operation
  const ops = operations || ['create', 'read', 'update', 'delete', 'list'];
  const opImports = ops.map(op => `  ${op}: ${op}Operation,`).join('\n');
  const opExports = ops.map(op => `export { ${op}Operation as ${op} } from './operations/${op}.js';`).join('\n');
  
  writeFileSync(join(dir, 'src/operations.ts'), `import { z } from 'zod';
import { Operation, OperationManifest } from '@flowos/connector-sdk';

${ops.map(op => `import { ${op}Operation } from './operations/${op}.js';`).join('\n')}

export const operations = {
${opImports}
};

${ops.map(op => {
  const opName = op.charAt(0).toUpperCase() + op.slice(1);
  return `export interface ${opName}Input extends z.infer<typeof ${op}Operation.inputSchema> {}
export interface ${opName}Output extends z.infer<typeof ${op}Operation.outputSchema> {}`;
}).join('\n\n')}
`);
  
  // Create operations directory and files
  const opsDir = join(dir, 'src/operations');
  mkdirSync(opsDir, { recursive: true });
  
  for (const op of ops) {
    const opName = op.charAt(0).toUpperCase() + op.slice(1);
    const httpMethod = op === 'create' ? 'POST' : op === 'update' ? 'PATCH' : op === 'delete' ? 'DELETE' : 'GET';
    const path = op === 'list' ? '/items' : op === 'create' ? '/items' : '/items/{id}';
    
    writeFileSync(join(opsDir, `${op}.ts`), `import { z } from 'zod';
import { Operation, OperationManifest, HttpMethod } from '@flowos/connector-sdk';

export const ${op}Operation: Operation<${opName}Input, ${opName}Output> = {
  manifest: {
    id: '${op}',
    name: '${opName}',
    description: '${opName} a ${name} resource',
    httpMethod: '${httpMethod}' as HttpMethod,
    path: '${path}',
    inputSchema: z.object({
      ${op === 'read' || op === 'update' || op === 'delete' ? 'id: z.string().describe("Resource ID"),' : ''}
      ${op === 'create' || op === 'update' ? 'data: z.record(z.unknown()).describe("Resource data"),' : ''}
      ${op === 'list' ? 'limit: z.number().optional().default(50),\n      offset: z.number().optional().default(0),' : ''}
      ${op === 'search' ? 'query: z.string().describe("Search query")' : ''}
    }),
    outputSchema: z.object({
      ${op === 'list' ? 'items: z.array(z.record(z.unknown())),\n      total: z.number()' : 'data: z.record(z.unknown())'}
    })
  } as OperationManifest,
  
  async execute(input, context) {
    const client = context.getHttpClient();
    
    ${op === 'create' ? `const response = await client.post('${path}', input.data);` : ''}
    ${op === 'read' ? `const response = await client.get(\`${path.replace('{id}', input.id)}\`);` : ''}
    ${op === 'update' ? `const response = await client.patch(\`${path.replace('{id}', input.id)}\`, input.data);` : ''}
    ${op === 'delete' ? `const response = await client.delete(\`${path.replace('{id}', input.id)}\`);` : ''}
    ${op === 'list' ? `const response = await client.get('${path}', { params: { limit: input.limit, offset: input.offset } });` : ''}
    ${op === 'search' ? `const response = await client.get('${path}', { params: { q: input.query } });` : ''}
    
    return response.data;
  }
};

export interface ${opName}Input extends z.infer<typeof ${op}Operation.manifest.inputSchema> {}
export interface ${opName}Output extends z.infer<typeof ${op}Operation.manifest.outputSchema> {}
`);
  }
  
  // src/auth.ts
  const authConfigs: Record<string, string> = {
    oauth2: `export const authConfig = {
  type: 'oauth2' as const,
  authorizationUrl: 'https://${name.replace('-', '')}.com/oauth/authorize',
  tokenUrl: 'https://${name.replace('-', '')}.com/oauth/token',
  scopes: ['read', 'write'],
  pkce: true
};`,
    api_key: `export const authConfig = {
  type: 'api_key' as const,
  headerName: 'X-API-Key',
  prefix: ''
};`,
    bearer: `export const authConfig = {
  type: 'bearer' as const,
  headerName: 'Authorization'
};`,
    none: `export const authConfig = {
  type: 'none' as const
};`
  };
  
  writeFileSync(join(dir, 'src/auth.ts'), authConfigs[auth] || authConfigs.none);
  
  // src/manifest.ts
  writeFileSync(join(dir, 'src/manifest.ts'), `import { ConnectorManifest } from '@flowos/connector-sdk';
import { ${className}Connector } from './index.js';

export const manifest: ConnectorManifest = ${className}Connector.manifest;

export default manifest;
`);
  
  // tests/operations.test.ts
  writeFileSync(join(dir, 'tests/operations.test.ts'), `import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ${className}Connector } from '../src/index.js';

describe('${className}Connector', () => {
  let connector: ${className}Connector;
  
  beforeEach(() => {
    connector = new ${className}Connector({
      ${auth === 'oauth2' ? 'accessToken: "test-token",' : auth === 'api_key' ? 'apiKey: "test-key",' : auth === 'bearer' ? 'token: "test-token",' : ''}
    });
  });
  
  it('should have a valid manifest', () => {
    expect(${className}Connector.manifest.id).toBe('${name}');
    expect(${className}Connector.manifest.name).toBe('${className}');
    expect(${className}Connector.manifest.operations).toHaveLength(${ops.length});
  });
  
  it('should test connection successfully', async () => {
    // Mock the HTTP client
    // const result = await connector.testConnection();
    // expect(result.success).toBe(true);
  });
  
  ${ops.map(op => `it('should execute ${op} operation', async () => {
    // const result = await connector.execute('${op}', { ... });
    // expect(result).toBeDefined();
  });`).join('\n  ')}
});
`);
  
  // README.md
  writeFileSync(join(dir, 'README.md'), `# ${className} Connector

Corelyx connector for ${name}.

## Operations

${ops.map(op => `- **${op.charAt(0).toUpperCase() + op.slice(1)}** - ${op} a resource`).join('\n')}

## Authentication

${auth === 'oauth2' ? 'OAuth 2.0 with PKCE' : auth === 'api_key' ? 'API Key header' : auth === 'bearer' ? 'Bearer token' : 'None'}

## Installation

\`\`\`bash
pnpm add @flowos/connectors-${name}
\`\`\`

## Usage

\`\`\`typescript
import { ${className}Connector } from '@flowos/connectors-${name}';

const connector = new ${className}Connector({
  ${auth === 'oauth2' ? 'accessToken: process.env.${name.toUpperCase()}_ACCESS_TOKEN' : auth === 'api_key' ? 'apiKey: process.env.${name.toUpperCase()}_API_KEY' : auth === 'bearer' ? 'token: process.env.${name.toUpperCase()}_TOKEN' : ''}
});

const result = await connector.execute('list', { limit: 10 });
console.log(result);
\`\`\`

## Development

\`\`\`bash
pnpm install
pnpm test
pnpm build
\`\`\`
`);
}

async function generateAgent(dir: string, config: any): Promise<void> {
  const { name } = config;
  const className = name!.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `@flowos/agents-${name}`,
    version: '0.1.0',
    description: `Corelyx agent: ${name}`,
    type: 'module',
    main: './src/index.ts',
    types: './src/index.ts',
    scripts: { 'type-check': 'tsc --noEmit', test: 'vitest run', build: 'tsc' },
    dependencies: { 'zod': '^3.23.8', '@flowos/connector-sdk': 'workspace:*', '@flowos/schema': 'workspace:*' },
    devDependencies: { '@types/node': '^20.14.0', 'typescript': '^5.4.5', 'vitest': '^1.6.0' },
    files: ['src'],
    license: 'MIT'
  }, null, 2));
  
  writeFileSync(join(dir, 'src/index.ts'), `import { z } from 'zod';
import { BaseAgent, AgentManifest } from '@flowos/connector-sdk';

export class ${className}Agent extends BaseAgent {
  static manifest: AgentManifest = {
    id: '${name}',
    name: '${className}',
    version: '0.1.0',
    description: 'AI agent for ${name}',
    category: 'agent',
    tools: [],
    systemPrompt: \`You are a specialized agent for ${name}.\`
  };

  constructor(config: Record<string, any>) {
    super('${name}', config);
  }

  async execute(input: any, context: any): Promise<any> {
    // Implement agent logic here
    return { result: 'Agent executed successfully' };
  }
}

export default ${className}Agent;
`);
  
  console.log(chalk.yellow('Agent scaffold created. Implement the execute() method.'));
}

async function generateStep(dir: string, config: any): Promise<void> {
  const { name } = config;
  const className = name!.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `@flowos/steps-${name}`,
    version: '0.1.0',
    description: `Corelyx custom step: ${name}`,
    type: 'module',
    main: './src/index.ts',
    types: './src/index.ts',
    scripts: { 'type-check': 'tsc --noEmit', test: 'vitest run', build: 'tsc' },
    dependencies: { 'zod': '^3.23.8', '@flowos/connector-sdk': 'workspace:*', '@flowos/schema': 'workspace:*' },
    devDependencies: { '@types/node': '^20.14.0', 'typescript': '^5.4.5', 'vitest': '^1.6.0' },
    files: ['src'],
    license: 'MIT'
  }, null, 2));
  
  writeFileSync(join(dir, 'src/index.ts'), `import { z } from 'zod';
import { BaseStep, StepManifest } from '@flowos/connector-sdk';

export class ${className}Step extends BaseStep {
  static manifest: StepManifest = {
    id: '${name}',
    name: '${className}',
    version: '0.1.0',
    description: 'Custom step for ${name}',
    category: 'transform',
    inputSchema: z.object({
      input: z.string().describe('Input data')
    }),
    outputSchema: z.object({
      output: z.string().describe('Transformed output')
    })
  };

  constructor(config: Record<string, any>) {
    super('${name}', config);
  }

  async execute(input: any, context: any): Promise<any> {
    // Implement step logic here
    return { output: \`Processed: \${input.input}\` };
  }
}

export default ${className}Step;
`);
  
  console.log(chalk.yellow('Step scaffold created. Implement the execute() method.'));
}

async function generateTrigger(dir: string, config: any): Promise<void> {
  const { name } = config;
  const className = name!.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `@flowos/triggers-${name}`,
    version: '0.1.0',
    description: `Corelyx trigger: ${name}`,
    type: 'module',
    main: './src/index.ts',
    types: './src/index.ts',
    scripts: { 'type-check': 'tsc --noEmit', test: 'vitest run', build: 'tsc' },
    dependencies: { 'zod': '^3.23.8', '@flowos/connector-sdk': 'workspace:*', '@flowos/schema': 'workspace:*' },
    devDependencies: { '@types/node': '^20.14.0', 'typescript': '^5.4.5', 'vitest': '^1.6.0' },
    files: ['src'],
    license: 'MIT'
  }, null, 2));
  
  writeFileSync(join(dir, 'src/index.ts'), `import { z } from 'zod';
import { BaseTrigger, TriggerManifest } from '@flowos/connector-sdk';

export class ${className}Trigger extends BaseTrigger {
  static manifest: TriggerManifest = {
    id: '${name}',
    name: '${className}',
    version: '0.1.0',
    description: 'Trigger for ${name}',
    category: 'webhook',
    eventSchema: z.object({
      event: z.string(),
      payload: z.record(z.unknown())
    }),
    webhookPath: '/webhook/${name}'
  };

  constructor(config: Record<string, any>) {
    super('${name}', config);
  }

  async verify(payload: any, headers: Record<string, string>): Promise<boolean> {
    // Implement webhook signature verification
    return true;
  }

  async parse(payload: any): Promise<any> {
    // Parse and normalize webhook payload
    return payload;
  }
}

export default ${className}Trigger;
`);
  
  console.log(chalk.yellow('Trigger scaffold created. Implement verify() and parse() methods.'));
}

async function updateConnectorsIndex(name: string): Promise<void> {
  const indexPath = join(CONNECTORS_DIR, 'index.ts');
  let content = '';
  
  if (existsSync(indexPath)) {
    content = readFileSync(indexPath, 'utf-8');
  }
  
  const exportLine = `export { ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Connector } from './${name}/index.js';`;
  
  if (!content.includes(exportLine)) {
    content += `\n${exportLine}\n`;
    writeFileSync(indexPath, content);
    console.log(chalk.green(`✓ Updated connectors index`));
  }
}

const nodesCommand = new Command('nodes')
  .description('Manage Corelyx nodes/connectors')
  .addCommand(
    new Command('create')
      .description('Scaffold a new connector/node')
      .option('-n, --name <name>', 'Connector name (kebab-case)')
      .option('-t, --type <type>', 'Type: connector | agent | step | trigger')
      .option('-o, --operations <ops...>', 'Operations to scaffold')
      .option('-a, --auth <type>', 'Auth type: oauth2 | api_key | bearer | none')
      .option('-u, --base-url <url>', 'Base API URL')
      .option('--non-interactive', 'Run without prompts')
      .action(createNodeCommand)
  )
  .addCommand(
    new Command('build')
      .description('Build a connector for publishing')
      .argument('<name>', 'Connector name')
      .action(async (name: string) => {
        console.log(chalk.cyan(`\n🔨 Building connector ${name}...`));
        console.log(chalk.gray('  Not yet implemented\n'));
      })
  )
  .addCommand(
    new Command('publish')
      .description('Publish connector to registry')
      .argument('<name>', 'Connector name')
      .option('--registry <url>', 'Registry URL')
      .action(async (name: string, options: { registry?: string }) => {
        console.log(chalk.cyan(`\n📦 Publishing connector ${name}...`));
        console.log(chalk.gray('  Not yet implemented\n'));
      })
  );

export { nodesCommand };