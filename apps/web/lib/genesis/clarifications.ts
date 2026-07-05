import { z } from "zod";

/**
 * Genesis V2 clarifying questions.
 *
 * Generation is never blocked by ambiguity: the model always emits its best
 * complete workflow, and when a specific node's configuration rests on a real
 * guess it may attach a top-level `clarifications` sidecar naming that node,
 * the question, and any downstream nodes whose behavior depends on the answer.
 * The sidecar is stripped here before schema validation — the canonical
 * program schema (the product contract) is untouched by this feature.
 *
 * Questions are model output: they may contain pseudonymization placeholders
 * and must be rehydrated before storage/display (the caller owns that, same
 * as for the schema).
 */

export const MAX_CLARIFICATIONS = 3;
const MAX_QUESTION_LENGTH = 500;

export const GenesisClarificationZ = z.object({
  node_id: z.string().min(1),
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
  blocked_node_ids: z.array(z.string()).max(20).default([]),
});

export type GenesisClarification = z.infer<typeof GenesisClarificationZ>;

/**
 * Pull the clarifications sidecar out of raw model output (mutates the object
 * by deleting the key so downstream schema validation never sees it).
 * Invalid entries and entries referencing nodes that don't exist are dropped
 * silently — a bad question must never fail an otherwise-valid generation.
 */
export function extractClarifications(parsedSchema: unknown): GenesisClarification[] {
  if (!parsedSchema || typeof parsedSchema !== "object" || Array.isArray(parsedSchema)) {
    return [];
  }
  const container = parsedSchema as Record<string, unknown>;
  const raw = container.clarifications;
  delete container.clarifications;
  if (!Array.isArray(raw)) return [];

  const nodeIds = new Set(
    Array.isArray(container.nodes)
      ? (container.nodes as Array<{ id?: unknown }>).map((node) => String(node?.id ?? ""))
      : []
  );

  const clarifications: GenesisClarification[] = [];
  for (const entry of raw) {
    if (clarifications.length >= MAX_CLARIFICATIONS) break;
    const parsed = GenesisClarificationZ.safeParse(entry);
    if (!parsed.success) continue;
    if (!nodeIds.has(parsed.data.node_id)) continue;
    clarifications.push({
      ...parsed.data,
      blocked_node_ids: parsed.data.blocked_node_ids.filter((id) => nodeIds.has(id)),
    });
  }
  return clarifications;
}

/**
 * Prompt section describing the sidecar, appended to the generation system
 * prompt (never to refinements — those already have the user's answer).
 */
export const CLARIFICATIONS_PROMPT_SECTION = `
CLARIFYING QUESTIONS (optional sidecar — use sparingly):
Always emit your best COMPLETE workflow; never leave a node half-configured because something is unclear. But when a specific node's configuration rests on a genuine guess that materially changes behavior (which channel/database/label to target, what threshold or schedule the user meant, whether an action should overwrite or append), you may add a top-level "clarifications" array next to "nodes"/"edges":
  "clarifications":[{"node_id":"<node whose config you guessed>","question":"<one specific, answerable question — reference what you chose and why it might be wrong>","blocked_node_ids":["<downstream nodes whose behavior depends on this answer>"]}]
Rules: at most ${MAX_CLARIFICATIONS} entries; each question must be about ONE concrete decision in ONE node; never ask about information already in the description or the capability list; never ask generic questions ("anything else?"). If nothing rests on a real guess, omit the array entirely — most workflows need no questions.`;
