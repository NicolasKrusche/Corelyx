// Genesis Decision Log — the "why did Genesis build it this way?" audit trail.
//
// Two layers, same output shape:
//   1. buildDeterministicDecisionLog(schema) — free, instant, always available.
//      Derived purely from the validated schema by reusing the explainNode /
//      getNodeAlternatives layer, plus a per-node confidence heuristic. Works on
//      every existing program, is pure, and is unit-testable.
//   2. generateDecisionLog({...}) — optionally enriches (1) with the generating
//      model's own reasoning + calibrated confidence per node. Best-effort: any
//      failure (no model, bad JSON, timeout) silently falls back to the
//      deterministic log, so generation is never blocked by this feature.
//
// The result is persisted alongside the program and surfaced two ways:
//   - UI: an expandable "Why this workflow?" reasoning tree.
//   - Compliance: a JSON audit export documenting the automated decision for
//     EU AI Act Art. 14 (human oversight) and Art. 50 (transparency).
//
// Server-safe. The deterministic path imports only type-only + the pure explain
// helpers, so it can also run client-side if ever needed.

import type { Node, ProgramSchema } from "@flowos/schema";
import { z } from "zod";
import { explainNode, getNodeAlternatives, providerLabel } from "./explain";

export const DECISION_LOG_VERSION = 1 as const;

/** Model sentinel used when no LLM reasoning was applied. */
export const DETERMINISTIC_MODEL = "deterministic";

export interface DecisionLogEntry {
  /** Schema node id this decision refers to. */
  node_id: string;
  /** Human-readable node label at generation time. */
  label: string;
  /** Schema node type (trigger, connection, agent, step, …). */
  node_type: string;
  /** Short "what this step does" headline. */
  step: string;
  /** Why Genesis chose this step in this position. */
  reasoning: string;
  /** Other options Genesis weighed but did not pick. */
  alternatives_considered: string[];
  /** Genesis' confidence in this decision, 0 (low) – 1 (high). */
  confidence: number;
}

export interface DecisionLog {
  version: typeof DECISION_LOG_VERSION;
  /** ISO timestamp the log was produced. */
  generated_at: string;
  /** Model that produced the reasoning, or DETERMINISTIC_MODEL. */
  model: string;
  /** One-paragraph "why this whole workflow" summary. */
  summary: string;
  entries: DecisionLogEntry[];
}

export const DecisionLogEntryZ = z.object({
  node_id: z.string(),
  label: z.string(),
  node_type: z.string(),
  step: z.string(),
  reasoning: z.string(),
  alternatives_considered: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const DecisionLogZ = z.object({
  version: z.literal(DECISION_LOG_VERSION),
  generated_at: z.string(),
  model: z.string(),
  summary: z.string(),
  entries: z.array(DecisionLogEntryZ),
});

// Nodes that are documentation-only carry no automated decision worth auditing.
const NON_DECISION_TYPES = new Set(["note", "group"]);

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

/**
 * Type-driven confidence heuristic for the deterministic log. It reflects how
 * mechanical vs. judgement-heavy the choice is: a scheduled trigger or a named
 * connector operation is a near-certain mapping; a raw HTTP fallback or an
 * open-ended agent step involves more interpretation, so it scores lower and
 * signals "review this" in the UI.
 */
export function heuristicConfidence(node: Node): number {
  switch (node.type) {
    case "trigger":
      return 0.9;
    case "connection": {
      const config = node.config as { connector_type?: string; operation?: unknown };
      if (config.connector_type === "http") return 0.6;
      if (config.connector_type === "file") return 0.75;
      // OAuth connector: a concrete operation is a confident mapping.
      return config.operation ? 0.85 : 0.7;
    }
    case "step":
      return 0.85;
    case "agent":
      return 0.7;
    case "agent_task":
      return 0.6;
    default:
      return 0.75;
  }
}

/**
 * Alternatives Genesis weighed for a node, as plain sentences. Connector nodes
 * reuse the same interchangeable-sibling logic that powers one-click swaps.
 */
function deterministicAlternatives(node: Node, schema: ProgramSchema): string[] {
  const swaps = getNodeAlternatives(node, schema, 3);
  return swaps.map((alt) => `Considered ${alt.label} as an equivalent choice.`);
}

/** Plain-language overview of what the workflow is and how it starts. */
function buildSummary(schema: ProgramSchema): string {
  const decisionNodes = schema.nodes.filter((n) => !NON_DECISION_TYPES.has(n.type));
  const stepCount = decisionNodes.length;
  const triggerNode = schema.nodes.find((n) => n.type === "trigger");
  const start = triggerNode
    ? explainNode(triggerNode, schema).why
    : "It runs when you start it manually.";
  return (
    `Genesis generated “${schema.program_name}” from your description as a ${stepCount}-step workflow. ` +
    `${start} Each step below records why Genesis chose it, the alternatives it weighed, and how confident it is in the decision.`
  );
}

/**
 * Build the deterministic decision log from a validated schema. Pure, free,
 * never throws. Documentation-only nodes (notes, groups) are excluded.
 */
export function buildDeterministicDecisionLog(
  schema: ProgramSchema,
  generatedAt: string
): DecisionLog {
  const entries: DecisionLogEntry[] = schema.nodes
    .filter((node) => !NON_DECISION_TYPES.has(node.type))
    .map((node) => {
      const explanation = explainNode(node, schema);
      return {
        node_id: node.id,
        label: node.label || providerLabel(node.type),
        node_type: node.type,
        step: explanation.headline,
        reasoning: explanation.why,
        alternatives_considered: deterministicAlternatives(node, schema),
        confidence: clampConfidence(heuristicConfidence(node)),
      };
    });

  return {
    version: DECISION_LOG_VERSION,
    generated_at: generatedAt,
    model: DETERMINISTIC_MODEL,
    summary: buildSummary(schema),
    entries,
  };
}

// ─── LLM enrichment ──────────────────────────────────────────────────────────

/** Per-node reasoning the model returns; all fields optional/merged over base. */
const ModelNodeReasoningZ = z.object({
  node_id: z.string(),
  reasoning: z.string().optional(),
  alternatives_considered: z.array(z.string()).optional(),
  confidence: z.number().optional(),
});

const ModelDecisionLogZ = z.object({
  summary: z.string().optional(),
  nodes: z.array(ModelNodeReasoningZ),
});

const DECISION_LOG_SYSTEM_PROMPT = `You are documenting why an AI workflow generator chose each step of a workflow it just produced. Your output becomes an audit trail for EU AI Act transparency (Art. 50) and human-oversight (Art. 14) obligations, so be accurate and concrete.

For EACH node in the provided workflow, explain:
- reasoning: 1-2 sentences on WHY this specific step was chosen for this position, grounded in the user's request and the neighbouring steps. Do not restate what the node does mechanically — explain the decision.
- alternatives_considered: 0-3 short phrases naming other approaches that could have worked but were not chosen, and implicitly why. Empty array if there was genuinely only one reasonable choice.
- confidence: a number 0.0-1.0 for how well this step matches the user's intent. Use lower values (<0.6) for steps you inferred or guessed, higher (>0.85) for steps directly implied by the request.

Also produce a "summary": one paragraph on why the workflow as a whole is shaped this way.

Return ONLY a JSON object of the form:
{"summary": string, "nodes": [{"node_id": string, "reasoning": string, "alternatives_considered": string[], "confidence": number}]}
No markdown, no code fences, no commentary.`;

function buildEnrichmentPrompt(schema: ProgramSchema, description: string): string {
  // Give the model a compact view: user's ask + the decision nodes with their
  // deterministic explanation as a starting point it can sharpen.
  const nodeLines = schema.nodes
    .filter((node) => !NON_DECISION_TYPES.has(node.type))
    .map((node) => {
      const explanation = explainNode(node, schema);
      return `- node_id="${node.id}" type=${node.type} label="${node.label}": ${explanation.headline} — ${explanation.why}`;
    })
    .join("\n");

  return (
    `USER REQUEST:\n${description || "(not provided)"}\n\n` +
    `GENERATED WORKFLOW "${schema.program_name}" — nodes to document:\n${nodeLines}\n\n` +
    `Return the JSON audit object for every node_id above.`
  );
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return body.trim();
  return body.slice(start, end + 1);
}

/** Merge model-provided reasoning over a deterministic base, field by field. */
export function mergeModelReasoning(
  base: DecisionLog,
  model: string,
  parsed: z.infer<typeof ModelDecisionLogZ>
): DecisionLog {
  const byId = new Map(parsed.nodes.map((n) => [n.node_id, n] as const));
  const entries = base.entries.map((entry) => {
    const override = byId.get(entry.node_id);
    if (!override) return entry;
    return {
      ...entry,
      reasoning: override.reasoning?.trim() ? override.reasoning.trim() : entry.reasoning,
      alternatives_considered:
        override.alternatives_considered && override.alternatives_considered.length > 0
          ? override.alternatives_considered
          : entry.alternatives_considered,
      confidence:
        typeof override.confidence === "number"
          ? clampConfidence(override.confidence)
          : entry.confidence,
    };
  });
  return {
    ...base,
    model,
    summary: parsed.summary?.trim() ? parsed.summary.trim() : base.summary,
    entries,
  };
}

export interface GenerateDecisionLogOptions {
  schema: ProgramSchema;
  description: string;
  /** ISO timestamp; injected so callers control the clock (and tests stay pure). */
  generatedAt: string;
  /** Optional model caller — reuse the generation caller. Omit to stay deterministic. */
  callModel?: (prompt: string, systemPrompt?: string) => Promise<string>;
  /** Model id to record when enrichment succeeds. */
  model?: string;
  /** Max wall-clock for the enrichment call before falling back. Default 20s. */
  timeoutMs?: number;
}

/**
 * Produce a decision log, enriching with model reasoning when a caller is
 * supplied. Always returns at least the deterministic log — never throws, never
 * blocks generation. The enrichment is bounded by a timeout so a slow model
 * can't stall the response.
 */
export async function generateDecisionLog(
  options: GenerateDecisionLogOptions
): Promise<DecisionLog> {
  const base = buildDeterministicDecisionLog(options.schema, options.generatedAt);
  if (!options.callModel || base.entries.length === 0) return base;

  const timeoutMs = options.timeoutMs ?? 20_000;
  try {
    const prompt = buildEnrichmentPrompt(options.schema, options.description);
    const raw = await Promise.race([
      options.callModel(prompt, DECISION_LOG_SYSTEM_PROMPT),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!raw) return base;

    const parsed = ModelDecisionLogZ.safeParse(JSON.parse(extractJsonObject(raw)));
    if (!parsed.success) return base;
    return mergeModelReasoning(base, options.model ?? DETERMINISTIC_MODEL, parsed.data);
  } catch {
    return base;
  }
}

/**
 * Coerce an unknown stored value (e.g. a jsonb column) into a DecisionLog, or
 * null if it isn't one. Used when reading persisted logs back for UI/export.
 */
export function parseStoredDecisionLog(value: unknown): DecisionLog | null {
  const result = DecisionLogZ.safeParse(value);
  return result.success ? result.data : null;
}
