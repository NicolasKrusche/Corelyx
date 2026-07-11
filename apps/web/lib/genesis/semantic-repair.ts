// Targeted, post-generation repair pass for validation problems that
// `validatePostGenesis` finds but previously just returned as an advisory
// warning/error — the schema was saved as-is regardless. Weaker/cheaper models
// hit these far more often than Sonnet-class models (a stray connection ref on
// a step node, a write op on a read-only connection, a connection operation
// missing a required param). Fixing them here — mechanically where the fix is
// unambiguous, via one narrow single-node model call where it isn't — closes
// part of the gap without needing a stronger model for the whole generation.
//
// Both repair paths are strictly additive: on any failure they leave the node
// exactly as the model produced it, so this can never make a generation worse
// or fail one that would otherwise have succeeded.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ConnectionNode, OAuthConnectionConfig, ProgramSchema } from "@flowos/schema";
import type { ValidationResult } from "@/lib/validation";
import { extractJson } from "@/lib/genesis/parsing";
import { getMissingRequiredParams, OPERATION_PARAM_FIELDS } from "@/lib/connectors/operation-params";
import { getProviderBaseURL } from "@/lib/genesis/request";
import { recordLlmUsage, type LlmUsageLike } from "@/lib/llm-usage-log";

const UNASSIGNED = "__USER_ASSIGNED__";

// ─── Shared model caller ────────────────────────────────────────────────────

export interface RepairModelContext {
  provider: string;
  apiKey: string;
  model: string;
  billing: "platform" | "byok";
  userId: string;
  workspaceId: string;
}

/**
 * Builds a `callModel(prompt, systemPrompt?)` function that reuses the same
 * key/model that already succeeded for the main generation call — no new
 * key/model fallback chain, just one small follow-up call. Shared by both the
 * streaming and non-streaming Genesis routes, and by both the missing-params
 * repair pass and the decomposed-generation resolve pass, so the
 * Anthropic/OpenAI dual-provider dance only lives in one place.
 */
export function createRepairModelCaller(
  ctx: RepairModelContext,
  maxTokens = 1024
): (prompt: string, systemPrompt?: string) => Promise<string> {
  return async (prompt: string, systemPrompt?: string): Promise<string> => {
    if (ctx.provider === "anthropic") {
      const anthropic = new Anthropic({ apiKey: ctx.apiKey });
      const msg = await anthropic.messages.create({
        model: ctx.model,
        max_tokens: maxTokens,
        temperature: 0,
        ...(systemPrompt && { system: systemPrompt }),
        messages: [{ role: "user", content: prompt }],
      });
      recordLlmUsage({
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        model: ctx.model,
        usage: msg.usage as LlmUsageLike,
        billing: ctx.billing,
        source: "genesis",
      });
      return msg.content[0]?.type === "text" ? (msg.content[0] as { type: "text"; text: string }).text : "";
    }

    const baseURL = getProviderBaseURL(ctx.provider);
    const openai = new OpenAI({ apiKey: ctx.apiKey, ...(baseURL && { baseURL }), timeout: 60_000 });
    const completion = await openai.chat.completions.create({
      model: ctx.model,
      max_tokens: maxTokens,
      ...(ctx.provider === "openrouter" && ({ usage: { include: true } } as object)),
      messages: [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        { role: "user" as const, content: prompt },
      ],
    });
    recordLlmUsage({
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      model: ctx.model,
      usage: (completion as { usage?: LlmUsageLike }).usage ?? null,
      billing: ctx.billing,
      source: "genesis",
    });
    return completion.choices[0]?.message?.content ?? "";
  };
}

// ─── Deterministic repairs (no model call — always safe, always cheap) ────

/**
 * Applies the subset of validatePostGenesis errors that have exactly one
 * correct mechanical fix. Mutates `schema` in place and returns which nodes
 * were touched, for logging.
 */
export function applyDeterministicRepairs(
  schema: ProgramSchema,
  validation: Pick<ValidationResult, "errors">
): { fixedNodeIds: string[] } {
  const fixedNodeIds: string[] = [];
  const nodesById = new Map(schema.nodes.map((n) => [n.id, n]));

  for (const err of validation.errors) {
    if (!err.node_id) continue;
    const node = nodesById.get(err.node_id);
    if (!node) continue;

    if (err.code === "ERR_009" && node.type === "step") {
      // Step nodes are logic-only (StepNodeZ requires connection:null); a
      // stray connection ref is always a model mistake, never intentional.
      (node as { connection: string | null }).connection = null;
      fixedNodeIds.push(node.id);
    }

    if (err.code === "ERR_012" && "config" in node && node.config && "scope_access" in node.config) {
      // Node asked for write/read_write but the linked connection only
      // granted read. Downgrading to read never grants more access than the
      // user approved — worst case the node becomes a no-op instead of
      // failing the whole program on a runtime permission error.
      (node.config as { scope_access: string }).scope_access = "read";
      fixedNodeIds.push(node.id);
    }
  }

  // ERR_013: agent_task node in a workflow-type program is never valid —
  // remove it (and any edges touching it) rather than leave a node the
  // runtime will reject outright.
  if (schema.program_type !== "agent") {
    const toRemove = new Set(
      validation.errors.filter((e) => e.code === "ERR_013" && e.node_id).map((e) => e.node_id!)
    );
    if (toRemove.size > 0) {
      schema.nodes = schema.nodes.filter((n) => !toRemove.has(n.id));
      schema.edges = schema.edges.filter((e) => !toRemove.has(e.from) && !toRemove.has(e.to));
      fixedNodeIds.push(...toRemove);
    }
  }

  return { fixedNodeIds };
}

// ─── Targeted model repair for missing operation params ───────────────────

export interface ParamRepairCandidate {
  node: ConnectionNode;
  // Same object as node.config, narrowed once here (config is a union and
  // OAuthConnectionConfig's connector_type is optional, so TS can't narrow it
  // from the discriminant checks below at every later use site).
  config: OAuthConnectionConfig;
  provider: string;
  operation: string;
  missingKeys: string[];
}

/**
 * Finds connection nodes with an operation set whose required params are
 * missing/sentinel-valued — the same condition validatePostGenesis flags as
 * WARN_004, recomputed directly against the schema so this module doesn't
 * depend on parsing warning message strings.
 */
export function collectParamRepairCandidates(
  schema: ProgramSchema,
  availableConnections: Array<{ name: string; provider: string }>
): ParamRepairCandidate[] {
  const candidates: ParamRepairCandidate[] = [];

  for (const node of schema.nodes) {
    if (node.type !== "connection") continue;
    if (node.config.connector_type === "http" || node.config.connector_type === "file") continue;
    const config = node.config as OAuthConnectionConfig;
    if (!config.operation) continue;
    const provider =
      availableConnections.find((c) => c.name === node.connection)?.provider ?? config.provider ?? "";
    if (!provider) continue;
    const missingKeys = getMissingRequiredParams(provider, config.operation, config.operation_params);
    if (missingKeys.length > 0) {
      candidates.push({ node, config, provider, operation: config.operation, missingKeys });
    }
  }

  return candidates;
}

export function buildParamRepairPrompt(candidate: ParamRepairCandidate, taskContext: string): string {
  const fields = OPERATION_PARAM_FIELDS[candidate.provider]?.[candidate.operation] ?? [];
  const fieldDocs = candidate.missingKeys
    .map((key) => {
      const f = fields.find((field) => field.key === key);
      if (!f) return `  - ${key}`;
      const hint = f.hint ? `: ${f.hint}` : "";
      const example = f.placeholder ? ` e.g. "${f.placeholder}"` : "";
      return `  - ${f.key} (${f.type})${hint}${example}`;
    })
    .join("\n");
  const currentParams = JSON.stringify(candidate.config.operation_params ?? {});

  return `A workflow node is missing required parameter values. Fill ONLY the missing keys listed below, using the task description for context. Return a single raw JSON object containing just those keys and their values — no explanation, no markdown, no code fences, no other keys.

TASK: ${taskContext}

NODE: ${candidate.provider}.${candidate.operation}
CURRENT operation_params: ${currentParams}

MISSING (fill these):
${fieldDocs}

If a value genuinely cannot be determined from the task description, return the exact string "${UNASSIGNED}" for that key — never guess or invent a fake-looking value (e.g. a made-up ID or email).`;
}

/**
 * Runs one narrow repair call per candidate (capped at maxNodes) via the
 * caller-supplied `callModel`, and merges any keys the model resolved back
 * into that node's operation_params. Best-effort: a parse failure or model
 * error for one node is swallowed and simply leaves that node's original
 * WARN_004 warning in place — it can never regress a node that was already
 * broken, only possibly fix it.
 */
export async function repairMissingOperationParams(
  schema: ProgramSchema,
  availableConnections: Array<{ name: string; provider: string }>,
  taskContext: string,
  callModel: (prompt: string) => Promise<string>,
  maxNodes = 3
): Promise<{ repairedNodeIds: string[] }> {
  const candidates = collectParamRepairCandidates(schema, availableConnections).slice(0, maxNodes);
  const repairedNodeIds: string[] = [];

  for (const candidate of candidates) {
    try {
      const prompt = buildParamRepairPrompt(candidate, taskContext);
      const text = await callModel(prompt);
      const parsed = JSON.parse(extractJson(text));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;

      const resolved: Record<string, unknown> = {};
      for (const key of candidate.missingKeys) {
        const value = (parsed as Record<string, unknown>)[key];
        if (value !== undefined && value !== UNASSIGNED) resolved[key] = value;
      }
      if (Object.keys(resolved).length === 0) continue;

      candidate.config.operation_params = {
        ...(candidate.config.operation_params ?? {}),
        ...resolved,
      };
      repairedNodeIds.push(candidate.node.id);
    } catch {
      continue;
    }
  }

  return { repairedNodeIds };
}
