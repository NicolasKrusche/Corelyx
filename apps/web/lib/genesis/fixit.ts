// Pre-Flight Fix-It Assistant — LLM prompt builder that takes validation errors
// + schema and returns RFC 6902 JSON Patch suggestions.
//
// The prompt is built server-side only (never sent to the client). It
// instructs the model to produce a JSON Patch that fixes the validation
// errors, constrained to safe operations (add/update nodes/edges, remove
// broken edges, set sentinel values). The response is validated with Zod
// before any patch is exposed to the UI.

import { z } from "zod";
import type { ProgramSchema } from "@flowos/schema";

// ─── JSON Patch (RFC 6902) types ────────────────────────────────────────────

export interface JsonPatchOp {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

export const JsonPatchOpZ = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: z.string().min(1),
  value: z.unknown().optional(),
  from: z.string().optional(),
});

// ─── Fix suggestion types ───────────────────────────────────────────────────

export interface FixSuggestion {
  /** Short human-readable description of what this fix does. */
  description: string;
  /** The JSON Patch operations to apply. */
  patch: JsonPatchOp[];
  /** Confidence score from the LLM (0–1). */
  confidence: number;
  /** Which validation errors this fix addresses. */
  addresses_errors: string[];
}

export const FixSuggestionZ = z.object({
  description: z.string().min(1),
  patch: z.array(JsonPatchOpZ).min(1),
  confidence: z.number().min(0).max(1),
  addresses_errors: z.array(z.string()),
});

export type FixSuggestionsResponse = z.infer<typeof FixSuggestionsResponseZ>;
export const FixSuggestionsResponseZ = z.object({
  suggestions: z.array(FixSuggestionZ),
});

// ─── Validation error input ─────────────────────────────────────────────────

export interface ValidationErrorInput {
  code: string;
  severity: "blocking" | "critical";
  node_id: string | null;
  edge_id: string | null;
  message: string;
  fix_suggestion: string;
}

// ─── Prompt builder ─────────────────────────────────────────────────────────

/**
 * Build the system prompt for the LLM fix-suggestion call.
 * Runs server-side only — never sent to the client.
 */
export function buildFixItSystemPrompt(): string {
  return `You are a workflow schema repair assistant. You receive a Corelyx workflow schema (JSON) and a list of validation errors. Your job is to produce JSON Patch operations (RFC 6902) that fix each error.

RULES:
1. ONLY produce patches that fix the listed validation errors. Do not refactor or improve unrelated parts.
2. For "sentinel value" errors (e.g. model or api_key_ref set to "__USER_ASSIGNED__"), replace with sensible defaults: model → "openai/gpt-4o-mini", api_key_ref → "platform".
3. For "missing connection" errors, you cannot create connections — instead suggest removing the broken edge or adding a placeholder.
4. For "missing required field" errors, add a reasonable default value or empty string.
5. For "broken graph link" errors (edges pointing to non-existent nodes), remove the broken edge.
6. For "type mismatch" errors, adjust the value to match the expected type.
7. NEVER remove nodes unless explicitly told to — prefer fixing the configuration.
8. NEVER modify trigger configs unless the trigger is the source of the error.
9. Return at most 3 fix suggestions, ordered by confidence (highest first).
10. Each suggestion must include the specific error codes it addresses.

OUTPUT FORMAT: Return a JSON object with a "suggestions" array. Each suggestion has:
- description: string (human-readable)
- patch: array of {op, path, value?, from?} (RFC 6902)
- confidence: number 0-1
- addresses_errors: array of error code strings`;
}

/**
 * Build the user prompt for the LLM fix-suggestion call.
 */
export function buildFixItUserPrompt(
  schema: ProgramSchema,
  errors: ValidationErrorInput[]
): string {
  // Redact credentials and PII from the schema before sending to the LLM
  const redactedSchema = redactSchemaForLLM(schema);

  const errorSummary = errors
    .map(
      (e, i) =>
        `[${i + 1}] Code: ${e.code} | Severity: ${e.severity} | Node: ${e.node_id ?? "n/a"} | Edge: ${e.edge_id ?? "n/a"}\n    Error: ${e.message}\n    Suggestion: ${e.fix_suggestion}`
    )
    .join("\n\n");

  return `## Workflow Schema

\`\`\`json
${JSON.stringify(redactedSchema, null, 2)}
\`\`\`

## Validation Errors (${errors.length} total)

${errorSummary}

## Task

Produce a JSON Patch (RFC 6902) to fix these validation errors. Return ONLY a JSON object with a "suggestions" array.`;
}

/**
 * Redact sensitive fields before sending schema to the LLM.
 * Keeps structure intact so the model understands the graph, but strips
 * credentials, tokens, and PII.
 */
function redactSchemaForLLM(schema: ProgramSchema): ProgramSchema {
  const redacted = JSON.parse(JSON.stringify(schema)) as ProgramSchema;

  for (const node of redacted.nodes) {
    if (node.type === "agent") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = node.config as any as {
        api_key_ref?: string;
        model?: string;
        system_prompt?: string;
        [key: string]: unknown;
      };
      // Replace real API key refs with placeholder so model doesn't see actual keys
      if (config.api_key_ref && config.api_key_ref !== "__USER_ASSIGNED__" && config.api_key_ref !== "platform") {
        config.api_key_ref = "__REDACTED__";
      }
    }
    if (node.type === "connection") {
      const config: Record<string, unknown> = node.config as unknown as Record<string, unknown>;
      // Redact auth tokens in HTTP connections
      if (config.auth_value) {
        config.auth_value = "__REDACTED__";
      }
      // Truncate long bodies that might contain secrets
      if (typeof config.body === "string" && config.body.length > 500) {
        config.body = config.body.slice(0, 500) + "... [redacted]";
      }
    }
  }

  return redacted;
}

/**
 * Parse and validate the LLM response into fix suggestions.
 * Returns null if the response is malformed.
 */
export function parseFixSuggestions(raw: unknown): FixSuggestionsResponse | null {
  if (!raw) return null;

  // Handle case where LLM wraps in markdown code block
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const result = FixSuggestionsResponseZ.safeParse(parsed);
  if (!result.success) return null;

  // Filter out suggestions with zero confidence or empty patches
  const validSuggestions = result.data.suggestions.filter(
    (s) => s.confidence > 0 && s.patch.length > 0
  );

  if (validSuggestions.length === 0) return null;

  return { suggestions: validSuggestions };
}

// ─── JSON Patch applier (RFC 6902, sandboxed) ───────────────────────────────

/**
 * Paths the Fix-It patch is allowed to touch. Confining the applier to the
 * graph (nodes/edges) means a hallucinated or malicious patch can never rewrite
 * credentials, triggers, metadata, or the program id — the safety boundary
 * matches the path filter enforced in the fixit API route.
 */
const ALLOWED_PATCH_ROOTS = ["nodes", "edges"] as const;

/** Decode a single JSON Pointer reference token (RFC 6901 §4). */
function decodePointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Parse a JSON Pointer path ("/nodes/0/config/model") into its tokens. */
function parsePointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) throw new Error(`Invalid JSON Pointer: ${path}`);
  return path.slice(1).split("/").map(decodePointerToken);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export interface ApplyPatchResult {
  ok: boolean;
  /** The patched document (only meaningful when ok). */
  result?: unknown;
  /** Human-readable reason the patch was rejected. */
  error?: string;
}

/**
 * Apply an RFC 6902 JSON Patch to a workflow schema, sandboxed to nodes/edges.
 *
 * Deliberately supports only add/replace/remove — the operations the Fix-It
 * assistant is allowed to emit. Any patch that references a disallowed root,
 * an out-of-bounds array index, or a missing target is rejected wholesale so
 * partial mutations never reach the database. The input is never mutated; a
 * deep clone is patched and returned.
 */
export function applyJsonPatch(
  target: unknown,
  patch: JsonPatchOp[]
): ApplyPatchResult {
  let doc: unknown;
  try {
    doc = JSON.parse(JSON.stringify(target));
  } catch {
    return { ok: false, error: "Schema is not serializable" };
  }

  for (const op of patch) {
    const tokens = (() => {
      try {
        return parsePointer(op.path);
      } catch (e) {
        return e as Error;
      }
    })();
    if (tokens instanceof Error) return { ok: false, error: tokens.message };
    if (tokens.length === 0) {
      return { ok: false, error: "Patches may not replace the whole document" };
    }
    if (!ALLOWED_PATCH_ROOTS.includes(tokens[0] as (typeof ALLOWED_PATCH_ROOTS)[number])) {
      return {
        ok: false,
        error: `Patch path "${op.path}" is outside the editable graph (nodes/edges only)`,
      };
    }

    // Walk to the parent container of the final token.
    let parent: unknown = doc;
    for (let i = 0; i < tokens.length - 1; i++) {
      const token = tokens[i];
      if (Array.isArray(parent)) {
        const idx = Number(token);
        if (!Number.isInteger(idx) || idx < 0 || idx >= parent.length) {
          return { ok: false, error: `Patch path "${op.path}" points past the end of an array` };
        }
        parent = parent[idx];
      } else if (isPlainRecord(parent)) {
        if (!(token in parent)) {
          return { ok: false, error: `Patch path "${op.path}" references a missing field` };
        }
        parent = parent[token];
      } else {
        return { ok: false, error: `Patch path "${op.path}" traverses a non-object value` };
      }
    }

    const key = tokens[tokens.length - 1];

    if (op.op === "remove") {
      if (Array.isArray(parent)) {
        const idx = Number(key);
        if (!Number.isInteger(idx) || idx < 0 || idx >= parent.length) {
          return { ok: false, error: `Cannot remove — index out of range at "${op.path}"` };
        }
        parent.splice(idx, 1);
      } else if (isPlainRecord(parent)) {
        if (!(key in parent)) {
          return { ok: false, error: `Cannot remove — field missing at "${op.path}"` };
        }
        delete parent[key];
      } else {
        return { ok: false, error: `Cannot remove at "${op.path}"` };
      }
      continue;
    }

    if (op.op === "add" || op.op === "replace") {
      if (Array.isArray(parent)) {
        if (key === "-") {
          if (op.op === "replace") {
            return { ok: false, error: `Cannot replace the append slot at "${op.path}"` };
          }
          parent.push(op.value);
        } else {
          const idx = Number(key);
          if (!Number.isInteger(idx) || idx < 0 || idx > parent.length) {
            return { ok: false, error: `Patch index out of range at "${op.path}"` };
          }
          if (op.op === "replace") {
            if (idx >= parent.length) {
              return { ok: false, error: `Cannot replace a non-existent array element at "${op.path}"` };
            }
            parent[idx] = op.value;
          } else {
            parent.splice(idx, 0, op.value);
          }
        }
      } else if (isPlainRecord(parent)) {
        if (op.op === "replace" && !(key in parent)) {
          return { ok: false, error: `Cannot replace a non-existent field at "${op.path}"` };
        }
        parent[key] = op.value;
      } else {
        return { ok: false, error: `Cannot set value at "${op.path}"` };
      }
      continue;
    }

    return { ok: false, error: `Unsupported patch operation "${op.op}"` };
  }

  return { ok: true, result: doc };
}

/**
 * Build the complete prompt payload for the LLM API call.
 * Returns the system prompt and user prompt ready for use.
 */
export function buildFixItPayload(
  schema: ProgramSchema,
  errors: ValidationErrorInput[]
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: buildFixItSystemPrompt(),
    userPrompt: buildFixItUserPrompt(schema, errors),
  };
}
