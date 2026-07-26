/**
 * Error Analysis Engine — classifies DLQ errors and generates AI fix suggestions.
 *
 * Takes a dead-letter queue entry, classifies the error type, and produces
 * an RFC 6902 JSON Patch suggestion via an LLM call. The prompt follows the
 * same safety constraints as the Pre-Flight Fix-It system.
 */

import { z } from "zod";
import type { ProgramSchema } from "@flowos/schema";
import {
  type JsonPatchOp,
  JsonPatchOpZ,
  type FixSuggestion,
  FixSuggestionZ,
} from "@/lib/genesis/fixit";

// ─── Error classification ─────────────────────────────────────────────────────

export type ErrorCategory =
  | "connector_auth"
  | "schema_validation"
  | "rate_limit"
  | "timeout"
  | "data_format_mismatch"
  | "connection_not_found"
  | "api_key_invalid"
  | "permission_denied"
  | "network_error"
  | "unknown";

interface ClassificationPattern {
  patterns: RegExp[];
  category: ErrorCategory;
}

const CLASSIFICATION_PATTERNS: ClassificationPattern[] = [
  {
    patterns: [
      /token.?expir|oauth.?error|unauthorized|401/i,
      /refresh.?token/i,
    ],
    category: "connector_auth",
  },
  {
    patterns: [/schema.?valid|invalid.?schema|validation.?fail|zod/i],
    category: "schema_validation",
  },
  {
    patterns: [/rate.?limit|429|too.?many.?request|quota.?exceed/i],
    category: "rate_limit",
  },
  {
    patterns: [/timeout|timed.?out|deadline.?exceed|504/i],
    category: "timeout",
  },
  {
    patterns: [
      /unexpected.?token|json.?parse|type.?mismatch|format.?error|malform/i,
    ],
    category: "data_format_mismatch",
  },
  {
    patterns: [/connection.?not.?found|no.?connection|missing.?connection/i],
    category: "connection_not_found",
  },
  {
    patterns: [/api.?key.?not.?found|invalid.?api.?key|api.?key.*invalid/i],
    category: "api_key_invalid",
  },
  {
    patterns: [/permission.?denied|forbidden|403|access.?denied|read.?only/i],
    category: "permission_denied",
  },
  {
    patterns: [/network.?error|econnrefused|econnreset|fetch.?fail|dns.?fail/i],
    category: "network_error",
  },
];

/**
 * Classify an error message into an ErrorCategory.
 */
export function classifyError(errorMessage: string): ErrorCategory {
  for (const { patterns, category } of CLASSIFICATION_PATTERNS) {
    if (patterns.some((p) => p.test(errorMessage))) {
      return category;
    }
  }
  return "unknown";
}

// ─── DLQ Entry type (mirrors the Python DeadLetterEntry) ─────────────────────

export interface DLQEntry {
  id: string;
  program_id: string;
  run_id: string;
  node_id: string;
  node_type: string;
  node_config: Record<string, unknown>;
  input_data: Record<string, unknown>;
  error_message: string;
  error_type: string;
  attempt_count: number;
  retry_policy: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  retry_count: number;
  last_error?: string | null;
  status: string;
  metadata?: Record<string, unknown>;
}

// ─── Analysis result ─────────────────────────────────────────────────────────

export interface ErrorAnalysisResult {
  /** Original DLQ entry ID. */
  dlq_entry_id: string;
  /** Classified error category. */
  error_category: ErrorCategory;
  /** Human-readable root cause explanation. */
  root_cause: string;
  /** AI-generated fix suggestion, or null when none could be produced. */
  fix_suggestion: FixSuggestion | null;
  /** Confidence in the classification and fix (0–1). */
  confidence: number;
  /** When the analysis was performed. */
  analyzed_at: string;
}

// ─── LLM prompt for error analysis + fix ─────────────────────────────────────

function buildErrorAnalysisPrompt(
  dlqEntry: DLQEntry,
  category: ErrorCategory
): string {
  return `You are a workflow runtime error analyst for Corelyx, a Visual Agentic OS.
A workflow run failed and the error was enqueued to the Dead Letter Queue.

## Dead Letter Entry
- Node ID: ${dlqEntry.node_id}
- Node Type: ${dlqEntry.node_type}
- Error Message: ${dlqEntry.error_message}
- Error Type: ${dlqEntry.error_type}
- Attempt Count: ${dlqEntry.attempt_count}
- Input Data: ${JSON.stringify(dlqEntry.input_data, null, 2).slice(0, 2000)}
- Node Config: ${JSON.stringify(dlqEntry.node_config, null, 2).slice(0, 2000)}

## Error Category: ${category}

## Instructions
1. Analyze the root cause of this failure.
2. Determine if the error is fixable via a schema patch (e.g. updating node config, removing a broken edge, reassigning API keys, adjusting timeouts).
3. If fixable, produce RFC 6902 JSON Patch operations that fix the error in the workflow schema.

## Safe Patch Operations
- ONLY patch paths under /nodes or /edges.
- For connector_auth errors: suggest replacing api_key_ref or connection_id.
- For rate_limit errors: suggest adding or increasing retry_policy.backoff_ms.
- For timeout errors: suggest increasing node config timeout_ms.
- For schema_validation: suggest correcting the invalid field.
- For data_format_mismatch: suggest adding output_transform or adjusting expected fields.
- For connection_not_found: suggest removing the edge referencing the missing node.
- For api_key_invalid: suggest assigning a valid api_key_ref value.

## Response Format
Return a JSON object (no markdown fences) with these fields:
{
  "root_cause": "Brief explanation of why the error occurred",
  "confidence": 0.0-1.0,
  "fix": {
    "description": "What this fix does",
    "patch": [
      { "op": "replace|add|remove", "path": "/nodes/0/config/field", "value": "new_value" }
    ],
    "confidence": 0.0-1.0
  }
}

If the error is NOT fixable via schema patch (e.g. external API down, rate limit with no config change possible), return:
{
  "root_cause": "Brief explanation",
  "confidence": 0.8,
  "fix": null
}`;
}

// ─── Classification summary for the DB ───────────────────────────────────────

export const ErrorClassificationZ = z.object({
  error_category: z.enum([
    "connector_auth",
    "schema_validation",
    "rate_limit",
    "timeout",
    "data_format_mismatch",
    "connection_not_found",
    "api_key_invalid",
    "permission_denied",
    "network_error",
    "unknown",
  ]),
  root_cause: z.string().min(1),
  fix_suggestion: FixSuggestionZ.nullable(),
  confidence: z.number().min(0).max(1),
});

export type ErrorClassification = z.infer<typeof ErrorClassificationZ>;

// ─── Re-export for convenience ────────────────────────────────────────────────
export { JsonPatchOpZ, type JsonPatchOp, type FixSuggestion, FixSuggestionZ };
