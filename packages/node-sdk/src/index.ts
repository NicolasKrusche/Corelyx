import { z } from 'zod';

/**
 * Node Category - matches the React Flow editor node categories
 */
export const NodeCategory = {
  TRIGGER: 'trigger',
  ACTION: 'action',
  TRANSFORM: 'transform',
  LOGIC: 'logic',
  AI: 'ai',
  CONNECTOR: 'connector',
  AGENT: 'agent',
} as const;

export type NodeCategory = (typeof NodeCategory)[keyof typeof NodeCategory];

/**
 * Node port definition (input/output ports for React Flow edges)
 */
export const PortSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['input', 'output']),
  dataType: z.enum(['string', 'number', 'boolean', 'object', 'array', 'any']),
  required: z.boolean().default(false),
  description: z.string().optional(),
  default: z.unknown().optional(),
});

export type Port = z.infer<typeof PortSchema>;

/**
 * Node position in the React Flow canvas
 */
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type Position = z.infer<typeof PositionSchema>;

/**
 * Node manifest - the complete node definition for the editor and runtime
 */
export const NodeManifestSchema = z.object({
  id: z.string().min(1),                    // Unique ID: 'slack.sendMessage'
  name: z.string().min(1),                  // Display name: 'Send Message'
  version: z.string().default('1.0.0'),
  description: z.string().optional(),
  category: z.nativeEnum(NodeCategory),
  icon: z.string().optional(),              // Lucide icon name or URL
  color: z.string().optional(),             // Hex color for node badge
  tags: z.array(z.string()).default([]),    // Search tags
  documentationUrl: z.string().url().optional(),
  inputs: z.array(PortSchema).default([]),
  outputs: z.array(PortSchema).default([]),
  configSchema: z.record(z.unknown()).optional(),  // Zod schema for node config
  credentials: z.object({
    required: z.boolean().default(false),
    schema: z.record(z.unknown()).optional(),
  }).optional(),
  examples: z.array(z.record(z.unknown())).default([]),
  versionHistory: z.array(z.object({
    version: z.string(),
    date: z.string(),
    changes: z.string(),
  })).default([]),
});

export type NodeManifest = z.infer<typeof NodeManifestSchema>;

/**
 * Node execution context - passed to execute() function
 */
export const ExecutionContextSchema = z.object({
  nodeId: z.string(),
  workflowId: z.string(),
  executionId: z.string(),
  nodeConfig: z.record(z.unknown()).default({}),
  credentials: z.record(z.unknown()).optional(),
  workflowData: z.record(z.unknown()).default({}),
  nodeOutputs: z.record(z.unknown()).default({}),  // Outputs from previous nodes
  workflowVariables: z.record(z.unknown()).default({}),
  executionId: z.string(),
  workflowId: z.string(),
  nodeId: z.string(),
  logger: z.object({
    info: z.function().args(z.string(), z.record(z.unknown()).optional()).returns(z.void()),
    warn: z.function().args(z.string(), z.record(z.unknown()).optional()).returns(z.void()),
    error: z.function().args(z.string(), z.record(z.unknown()).optional()).returns(z.void()),
    debug: z.function().args(z.string(), z.record(z.unknown()).optional()).returns(z.void()),
  }).optional(),
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

/**
 * Node execution result
 */
export const NodeResultSchema = z.object({
  success: z.boolean(),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  logs: z.array(z.string()).optional(),
  nextNodes: z.array(z.string()).optional(),  // For conditional branching
});

export type NodeResult = z.infer<typeof NodeResultSchema>;

/**
 * Node execute function signature
 */
export type NodeExecuteFn = (
  input: Record<string, unknown>,
  context: ExecutionContext
) => Promise<NodeResult>;

/**
 * Define a workflow node (action/transform/logic/ai/connector)
 */
export interface DefineNodeOptions {
  id: string;
  name: string;
  version?: string;
  description?: string;
  category: NodeCategory;
  icon?: string;
  color?: string;
  tags?: string[];
  documentationUrl?: string;
  inputs?: Omit<Port, 'id' | 'type'>[];
  outputs?: Omit<Port, 'id' | 'type'>[];
  configSchema?: z.ZodSchema<Record<string, unknown>>;
  credentials?: {
    required: boolean;
    schema?: z.ZodSchema<Record<string, unknown>>;
  };
  examples?: Record<string, unknown>[];
  execute: NodeExecuteFn;
}

export function defineNode(options: DefineNodeOptions): NodeManifest & {
  execute: NodeExecuteFn;
  configSchema: z.ZodSchema<Record<string, unknown>> | undefined;
} {
  const inputs: Port[] = (options.inputs || []).map((input, index) => ({
    id: `input-${index}`,
    name: input.name,
    type: 'input' as const,
    dataType: input.dataType,
    required: input.required ?? false,
    description: input.description,
    default: input.default,
  }));

  const outputs: Port[] = (options.outputs || []).map((output, index) => ({
    id: `output-${index}`,
    name: output.name,
    type: 'output' as const,
    dataType: output.dataType,
    required: output.required ?? false,
    description: output.description,
    default: output.default,
  }));

  const manifest: NodeManifest = {
    id: options.id,
    name: options.name,
    version: options.version ?? '1.0.0',
    description: options.description,
    category: options.category,
    icon: options.icon,
    color: options.color,
    tags: options.tags ?? [],
    documentationUrl: options.documentationUrl,
    inputs,
    outputs,
    configSchema: options.configSchema ? zodToJsonSchema(options.configSchema) : undefined,
    credentials: options.credentials ? {
      required: options.credentials.required,
      schema: options.credentials.schema ? zodToJsonSchema(options.credentials.schema) : undefined,
    } : undefined,
    examples: options.examples ?? [],
    versionHistory: [],
  };

  return {
    ...manifest,
    execute: options.execute,
    configSchema: options.configSchema,
  };
}

/**
 * Trigger manifest - for event-driven workflow triggers
 */
export const TriggerManifestSchema = NodeManifestSchema.extend({
  category: z.literal(NodeCategory.TRIGGER),
  triggerType: z.enum(['webhook', 'schedule', 'polling', 'event', 'manual']),
  webhookPath: z.string().optional(),
  scheduleExpression: z.string().optional(), // cron expression
  pollingInterval: z.number().optional(),    // milliseconds
  eventTypes: z.array(z.string()).optional(),
  webhookSecret: z.string().optional(),
});

export type TriggerManifest = z.infer<typeof TriggerManifestSchema>;

/**
 * Trigger execute context - includes webhook payload, schedule info, etc.
 */
export const TriggerContextSchema = ExecutionContextSchema.extend({
  triggerPayload: z.record(z.unknown()).optional(),
  triggerHeaders: z.record(z.string()).optional(),
  scheduleTime: z.string().optional(),
  pollCursor: z.string().optional(),
});

export type TriggerContext = z.infer<typeof TriggerContextSchema>;

/**
 * Trigger execute function - returns data that starts the workflow
 */
export type TriggerExecuteFn = (
  context: TriggerContext
) => Promise<{ success: boolean; data?: Record<string, unknown>; cursor?: string }>;

/**
 * Define a workflow trigger
 */
export interface DefineTriggerOptions {
  id: string;
  name: string;
  version?: string;
  description?: string;
  icon?: string;
  color?: string;
  tags?: string[];
  documentationUrl?: string;
  triggerType: 'webhook' | 'schedule' | 'polling' | 'event' | 'manual';
  webhookPath?: string;
  scheduleExpression?: string; // cron
  pollingInterval?: number;    // ms
  eventTypes?: string[];
  webhookSecret?: string;
  outputs?: Omit<Port, 'id' | 'type'>[];
  configSchema?: z.ZodSchema<Record<string, unknown>>;
  credentials?: {
    required: boolean;
    schema?: z.ZodSchema<Record<string, unknown>>;
  };
  execute: TriggerExecuteFn;
}

export function defineTrigger(options: DefineTriggerOptions): TriggerManifest & {
  execute: TriggerExecuteFn;
  configSchema: z.ZodSchema<Record<string, unknown>> | undefined;
} {
  const outputs: Port[] = (options.outputs || []).map((output, index) => ({
    id: `output-${index}`,
    name: output.name,
    type: 'output' as const,
    dataType: output.dataType,
    required: output.required ?? false,
    description: output.description,
    default: output.default,
  }));

  const manifest: TriggerManifest = {
    id: options.id,
    name: options.name,
    version: options.version ?? '1.0.0',
    description: options.description,
    category: NodeCategory.TRIGGER,
    icon: options.icon,
    color: options.color,
    tags: options.tags ?? [],
    documentationUrl: options.documentationUrl,
    inputs: [],
    outputs,
    configSchema: options.configSchema ? zodToJsonSchema(options.configSchema) : undefined,
    credentials: options.credentials ? {
      required: options.credentials.required,
      schema: options.credentials.schema ? zodToJsonSchema(options.credentials.schema) : undefined,
    } : undefined,
    examples: [],
    versionHistory: [],
    triggerType: options.triggerType,
    webhookPath: options.webhookPath,
    scheduleExpression: options.scheduleExpression,
    pollingInterval: options.pollingInterval,
    eventTypes: options.eventTypes,
    webhookSecret: options.webhookSecret,
  };

  return {
    ...manifest,
    execute: options.execute,
    configSchema: options.configSchema,
  };
}

/**
 * Connection manifest - for external service connections (OAuth, API keys, etc.)
 */
export const ConnectionManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  description: z.string().optional(),
  category: z.string().default('connector'),
  icon: z.string().optional(),
  color: z.string().optional(),
  auth: z.object({
    type: z.enum(['oauth2', 'api_key', 'bearer', 'basic', 'none']),
    config: z.record(z.unknown()).optional(),
  }),
  baseUrl: z.string().url().optional(),
  scopes: z.array(z.string()).default([]),
  testConnection: z.function().args(z.record(z.unknown())).returns(z.promise(z.object({
    success: z.boolean(),
    message: z.string().optional(),
  }))).optional(),
});

export type ConnectionManifest = z.infer<typeof ConnectionManifestSchema>;

/**
 * Define an external service connection (connector)
 */
export interface DefineConnectionOptions {
  id: string;
  name: string;
  version?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  auth: {
    type: 'oauth2' | 'api_key' | 'bearer' | 'basic' | 'none';
    config?: Record<string, unknown>;
  };
  baseUrl?: string;
  scopes?: string[];
  testConnection?: (config: Record<string, unknown>) => Promise<{ success: boolean; message?: string }>;
  operations?: Record<string, {
    name: string;
    description: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    inputSchema: z.ZodSchema;
    outputSchema: z.ZodSchema;
  }>;
}

export function defineConnection(options: DefineConnectionOptions): ConnectionManifest & {
  operations: DefineConnectionOptions['operations'];
} {
  const manifest: ConnectionManifest = {
    id: options.id,
    name: options.name,
    version: options.version ?? '1.0.0',
    description: options.description,
    category: options.category ?? 'connector',
    icon: options.icon,
    color: options.color,
    auth: {
      type: options.auth.type,
      config: options.auth.config,
    },
    baseUrl: options.baseUrl,
    scopes: options.scopes ?? [],
    testConnection: options.testConnection,
  };

  return {
    ...manifest,
    operations: options.operations,
  };
}

/**
 * Agent manifest - for AI agents with tools
 */
export const AgentManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  description: z.string().optional(),
  category: z.literal(NodeCategory.AGENT),
  icon: z.string().optional(),
  color: z.string().optional(),
  systemPrompt: z.string(),
  tools: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    inputSchema: z.record(z.unknown()),
    execute: z.function().args(z.record(z.unknown())).returns(z.promise(z.unknown())),
  })).default([]),
  memory: z.object({
    type: z.enum(['buffer', 'summary', 'vector']).default('buffer'),
    maxTokens: z.number().optional(),
  }).optional(),
  model: z.object({
    provider: z.string(),
    model: z.string(),
    temperature: z.number().default(0.7),
    maxTokens: z.number().optional(),
  }).optional(),
});

export type AgentManifest = z.infer<typeof AgentManifestSchema>;

/**
 * Agent execute context
 */
export const AgentContextSchema = ExecutionContextSchema.extend({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string(),
    toolCalls: z.array(z.unknown()).optional(),
    toolCallId: z.string().optional(),
  })).default([]),
  tools: z.array(z.object({
    id: z.string(),
    name: z.string(),
    execute: z.function().args(z.record(z.unknown())).returns(z.promise(z.unknown())),
  })).default([]),
  memory: z.record(z.unknown()).optional(),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;

/**
 * Agent execute function
 */
export type AgentExecuteFn = (
  input: string,
  context: AgentContext
) => Promise<{ response: string; toolCalls?: unknown[] }>;

/**
 * Define an AI agent
 */
export interface DefineAgentOptions {
  id: string;
  name: string;
  version?: string;
  description?: string;
  icon?: string;
  color?: string;
  systemPrompt: string;
  tools?: Array<{
    id: string;
    name: string;
    description: string;
    inputSchema: z.ZodSchema;
    execute: (input: Record<string, unknown>) => Promise<unknown>;
  }>;
  memory?: {
    type: 'buffer' | 'summary' | 'vector';
    maxTokens?: number;
  };
  model?: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  execute?: AgentExecuteFn;
}

export function defineAgent(options: DefineAgentOptions): AgentManifest & {
  execute?: AgentExecuteFn;
} {
  const manifest: AgentManifest = {
    id: options.id,
    name: options.name,
    version: options.version ?? '1.0.0',
    description: options.description,
    category: NodeCategory.AGENT,
    icon: options.icon,
    color: options.color,
    systemPrompt: options.systemPrompt,
    tools: (options.tools || []).map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema),
      execute: tool.execute,
    })),
    memory: options.memory,
    model: options.model,
  };

  return {
    ...manifest,
    execute: options.execute,
  };
}

/**
 * Convert Zod schema to JSON Schema (for manifest serialization)
 */
function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  try {
    const { zodToJsonSchema } = require('zod-to-json-schema');
    return zodToJsonSchema(schema);
  } catch {
    // Fallback if zod-to-json-schema not available
    return { type: 'object', properties: {} };
  }
}

/**
 * Node registry - registry of all nodes, triggers, connections, agents
 */
export interface NodeRegistry {
  nodes: Map<string, ReturnType<typeof defineNode>>;
  triggers: Map<string, ReturnType<typeof defineTrigger>>;
  connections: Map<string, ReturnType<typeof defineConnection>>;
  agents: Map<string, ReturnType<typeof defineAgent>>;
}

let _registry: NodeRegistry = {
  nodes: new Map(),
  triggers: new Map(),
  connections: new Map(),
  agents: new Map(),
};

export function getRegistry(): NodeRegistry {
  return _registry;
}

export function registerNode(node: ReturnType<typeof defineNode>): void {
  _registry.nodes.set(node.id, node);
}

export function registerTrigger(trigger: ReturnType<typeof defineTrigger>): void {
  _registry.triggers.set(trigger.id, trigger);
}

export function registerConnection(connection: ReturnType<typeof defineConnection>): void {
  _registry.connections.set(connection.id, connection);
}

export function registerAgent(agent: ReturnType<typeof defineAgent>): void {
  _registry.agents.set(agent.id, agent);
}

export function getNode(id: string) {
  return _registry.nodes.get(id);
}

export function getTrigger(id: string) {
  return _registry.triggers.get(id);
}

export function getConnection(id: string) {
  return _registry.connections.get(id);
}

export function getAgent(id: string) {
  return _registry.agents.get(id);
}

export function getAllNodes() {
  return Array.from(_registry.nodes.values());
}

export function getAllTriggers() {
  return Array.from(_registry.triggers.values());
}

export function getAllConnections() {
  return Array.from(_registry.connections.values());
}

export function getAllAgents() {
  return Array.from(_registry.agents.values());
}

export function clearRegistry() {
  _registry = {
    nodes: new Map(),
    triggers: new Map(),
    connections: new Map(),
    agents: new Map(),
  };
}

/**
 * Generate manifest JSON for all registered nodes
 */
export function generateManifest(): Record<string, unknown> {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    nodes: Object.fromEntries(
      Array.from(_registry.nodes.entries()).map(([id, node]) => [id, node])
    ),
    triggers: Object.fromEntries(
      Array.from(_registry.triggers.entries()).map(([id, trigger]) => [id, trigger])
    ),
    connections: Object.fromEntries(
      Array.from(_registry.connections.entries()).map(([id, conn]) => [id, conn])
    ),
    agents: Object.fromEntries(
      Array.from(_registry.agents.entries()).map(([id, agent]) => [id, agent])
    ),
  };
}

/**
 * Write manifest to file
 */
export async function writeManifest(filePath: string): Promise<void> {
  const fs = await import('fs/promises');
  const manifest = generateManifest();
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));
}