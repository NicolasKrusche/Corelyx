// Conversion prompt for Relay.app → Corelyx migration.
//
// The heavy lifting — the full Corelyx schema, the per-provider operation
// catalogs, the "output a single JSON object" contract — is reused from
// buildGenesisSystemPrompt(). This module only adds (a) an addendum teaching the
// Relay→Corelyx concept map, and (b) a user message that embeds the two Relay
// artifacts we understand: the build prompt (authoritative) and the structural
// JSON (grounding). Prompt-first by design: we do NOT parse the JSON into a
// schema ourselves — the model interprets it, exactly as Relay tells its own
// users to do.

import { RELAY_CONCEPT_MAP } from "./mapping";

/** Appended to the Genesis system prompt for a migration conversion call. */
export function buildRelayConversionAddendum(): string {
  const conceptLines = RELAY_CONCEPT_MAP.map(
    (c) => `  - ${c.relay}  →  ${c.corelyx}${c.note ? `   (${c.note})` : ""}`
  ).join("\n");

  return `\n\n=== RELAY.APP MIGRATION MODE ===
You are migrating an existing automation FROM Relay.app (a workflow tool that is shutting down) INTO Corelyx. Reproduce the SAME behavior as a Corelyx program — do not redesign it, add features, or remove steps.

You will be given two things about the source workflow:
  1. A build prompt: Relay's own plain-language description of the workflow. This is authoritative — follow it for intent, order, and branching.
  2. The raw workflow JSON (optional): Relay's export structure. It uses field names that differ from Corelyx and is provided only as structural grounding. Infer intent from it; never copy its field names verbatim.

Map Relay concepts to Corelyx like this:
${conceptLines}

Hard rules for migration:
  - Preserve the trigger. Carry a scheduled trigger's schedule AND timezone into a valid five-field cron expression + IANA timezone.
  - For each app action, emit a connection node with the correct Corelyx provider slug in config.provider, the closest matching operation, and any operation_params you can infer from the build prompt. Set node.connection to a short human label for the app (e.g. "Gmail", "Slack", "Notion") so the user can reconnect it after import.
  - Do NOT invent credentials, connection IDs, API keys, tokens, channel IDs, database IDs, or record IDs. If a required value isn't in the source material, leave the param out — the user fills it in when they reconnect.
  - For any Relay step with no Corelyx equivalent (custom JS code, Tables, an unsupported app, an MCP server), emit a note node whose content begins "Relay step needs manual setup:" and briefly describes what it did. Never drop it silently and never fail the whole conversion over one step.
  - This is a migration into review, so the program must be INACTIVE: set metadata.is_active to false.
  - Prefer execution_mode "approval_required" if the Relay workflow had any human-in-the-loop review; otherwise "autonomous".`;
}

// ─── Size capping ─────────────────────────────────────────────────────────────
// Relay workflow JSON can carry large string blobs (sample payloads, embedded
// docs, base64). We only need the structure, so prune aggressively before it
// goes into the prompt — this both controls token cost and keeps us under the
// model's context window.

const BULKY_KEY_RE = /(body_?html|attachment|base64|data_?uri|thumbnail|screenshot|run_?history|runs|raw_?body|html)/i;
const MAX_STRING_LEN = 500;

function pruneForPrompt(value: unknown, depth: number): unknown {
  if (depth > 30) return null;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LEN ? `${value.slice(0, MAX_STRING_LEN)}…[truncated]` : value;
  }
  if (Array.isArray(value)) {
    // Cap very long arrays (e.g. a sample of 500 rows) — a handful conveys shape.
    const capped = value.slice(0, 25).map((v) => pruneForPrompt(v, depth + 1));
    if (value.length > 25) capped.push(`…[${value.length - 25} more items omitted]`);
    return capped;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (BULKY_KEY_RE.test(key)) {
        out[key] = "…[omitted]";
        continue;
      }
      out[key] = pruneForPrompt(child, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Serialize a Relay workflow JSON value for inclusion in the prompt: prune
 * bulky fields/strings/arrays, then hard-cap the total length. Accepts either a
 * parsed value or a raw JSON string.
 */
export function capJsonForPrompt(json: unknown, maxChars = 24_000): string {
  let value = json;
  if (typeof json === "string") {
    try {
      value = JSON.parse(json.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
    } catch {
      // Not parseable — treat the raw string as the content, just length-capped.
      return json.length > maxChars ? `${json.slice(0, maxChars)}…[truncated]` : json;
    }
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(pruneForPrompt(value, 0), null, 2);
  } catch {
    return "";
  }
  if (serialized.length > maxChars) {
    return `${serialized.slice(0, maxChars)}\n…[truncated]`;
  }
  return serialized;
}

export type RelayConversionInput = {
  name?: string;
  /** Relay's "Copy build prompt" / prompt.md content. */
  buildPrompt?: string | null;
  /** Raw Relay workflow JSON (string or parsed). */
  workflowJson?: unknown;
};

/**
 * Build the conversion user message. At least one of buildPrompt/workflowJson
 * should be present; the caller validates that.
 */
export function buildRelayConversionUserMessage(input: RelayConversionInput): string {
  const parts: string[] = [];
  parts.push(
    `Convert this Relay.app workflow into a single Corelyx program JSON object, following the RELAY.APP MIGRATION MODE rules above.`
  );
  if (input.name?.trim()) {
    parts.push(`\nSource workflow name: ${input.name.trim()}`);
  }

  const buildPrompt = input.buildPrompt?.trim();
  if (buildPrompt) {
    // Cap the build prompt too — Relay's can be long, but this is the one place
    // the 2,000-char Genesis limit would have bitten, so allow a generous cap.
    const capped = buildPrompt.length > 12_000 ? `${buildPrompt.slice(0, 12_000)}…[truncated]` : buildPrompt;
    parts.push(`\n--- RELAY BUILD PROMPT (authoritative description) ---\n${capped}`);
  }

  const jsonBlock = input.workflowJson === undefined || input.workflowJson === null || input.workflowJson === ""
    ? ""
    : capJsonForPrompt(input.workflowJson);
  if (jsonBlock) {
    parts.push(`\n--- RELAY WORKFLOW JSON (structural grounding; unfamiliar field names — infer intent) ---\n${jsonBlock}`);
  }

  if (!buildPrompt && !jsonBlock) {
    parts.push(`\n(No source material was provided.)`);
  }

  parts.push(`\nReturn ONLY the Corelyx program JSON object — no explanation, no markdown fences.`);
  return parts.join("\n");
}

/**
 * One-shot self-repair message: the previous attempt failed schema validation.
 * Give the model its own output plus the concrete error and ask for a corrected
 * full schema. Reuses the same system prompt (schema + operations) as the first
 * call.
 */
export function buildRelayRepairUserMessage(previousJson: string, errorMessage: string): string {
  const capped = previousJson.length > 20_000 ? `${previousJson.slice(0, 20_000)}…[truncated]` : previousJson;
  return `The Corelyx program JSON you produced did not pass schema validation.

VALIDATION ERROR:
${errorMessage}

YOUR PREVIOUS OUTPUT:
${capped}

Return a corrected version of the FULL program JSON object that fixes the error above, keeping everything else the same. Still follow the RELAY.APP MIGRATION MODE rules (inactive program, note nodes for unmapped steps, no invented credentials). Return ONLY the JSON object — no explanation, no markdown fences.`;
}
