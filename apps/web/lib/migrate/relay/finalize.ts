// Turn a conversion model's raw text into a validated Corelyx ProgramSchema.
// This is the model-independent half of the migration converter (the route owns
// the model call), so it is unit-testable against canned model outputs. It
// mirrors the post-model steps of the Genesis stream route, minus streaming:
// extract JSON → normalize → draft-validate → strict-parse, and always lands
// the program INACTIVE (a migration produces something the user reviews, never
// an auto-running workflow).

import { jsonrepair } from "jsonrepair";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { extractJson, normalizeSchema } from "@/lib/genesis/parsing";
import {
  normalizeProgramDraft,
  pruneUnresolvedReferences,
  validateProgramDraft,
} from "@/lib/workflow/normalize";

/** Marker tag added to every migrated program's metadata, for analytics. */
export const RELAY_MIGRATION_TAG = "relay-migration";

/** True if a schema was produced by the Relay importer (carries the marker tag). */
export function isRelayMigration(schema: Pick<ProgramSchema, "metadata">): boolean {
  return Array.isArray(schema.metadata?.tags) && schema.metadata.tags.includes(RELAY_MIGRATION_TAG);
}

export class RelayConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayConversionError";
  }
}

/**
 * Recover a JSON object from the model's text. Tolerates markdown fences,
 * leading/trailing prose, and (via jsonrepair) minor structural slips.
 * Throws RelayConversionError if nothing usable can be recovered.
 */
export function parseConvertedSchema(rawText: string): unknown {
  const extracted = extractJson(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch {
    try {
      parsed = JSON.parse(jsonrepair(extracted));
    } catch {
      throw new RelayConversionError(
        "The conversion model did not return usable workflow JSON."
      );
    }
  }
  // jsonrepair will happily coerce a bare sentence ("the model refused") into a
  // JSON string — a schema must be an object, so reject anything else.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RelayConversionError(
      "The conversion model did not return a workflow object."
    );
  }
  return parsed;
}

export type FinalizeResult = {
  schema: ProgramSchema;
  draftValid: boolean;
  draftError?: ReturnType<typeof validateProgramDraft> extends { error: infer E } ? E : never;
  /** Number of dangling edges/triggers pruned (for logging). */
  removed: { edges: number; triggers: number };
};

/**
 * Normalize + validate a parsed conversion result into a ProgramSchema.
 * Best-effort: even when draft validation fails, `schema` holds the normalized
 * shape so the caller can attempt a repair round with a concrete error.
 */
export function finalizeConvertedSchema(
  parsed: unknown,
  options: { fallbackName?: string } = {}
): FinalizeResult {
  // Replace the placeholder program_id the prompt example uses.
  if (
    parsed &&
    typeof parsed === "object" &&
    "program_id" in parsed &&
    (parsed as Record<string, unknown>).program_id === "__GENERATED__"
  ) {
    (parsed as Record<string, unknown>).program_id = crypto.randomUUID();
  }

  // In-place fixes for common non-Anthropic deviations, then draft-normalize
  // into a full ProgramSchema shape.
  normalizeSchema(parsed);
  const normalized = normalizeProgramDraft(parsed) as ProgramSchema;

  // Migration always lands as a draft for review — never auto-activate.
  normalized.metadata.is_active = false;
  if (!Array.isArray(normalized.metadata.tags)) normalized.metadata.tags = [];
  if (!normalized.metadata.tags.includes(RELAY_MIGRATION_TAG)) {
    normalized.metadata.tags.push(RELAY_MIGRATION_TAG);
  }
  // Fall back to the provided name (e.g. the zip folder) if the model left it blank.
  if (
    (!normalized.program_name || normalized.program_name === "Untitled program") &&
    options.fallbackName?.trim()
  ) {
    normalized.program_name = options.fallbackName.trim().slice(0, 120);
  }

  // Drop edges/triggers pointing at nodes that don't exist — one stray
  // reference shouldn't fail an otherwise-valid migration (the user reviews it).
  const pruned = pruneUnresolvedReferences(normalized);

  const draftResult = validateProgramDraft(normalized);
  if (!draftResult.success) {
    return {
      schema: normalized,
      draftValid: false,
      draftError: draftResult.error as FinalizeResult["draftError"],
      removed: { edges: pruned.removedEdges, triggers: pruned.removedTriggers },
    };
  }

  // Prefer the strict parse when it succeeds; fall back to the lenient draft.
  const strict = ProgramSchemaZ.safeParse(normalized);
  const schema = (strict.success ? strict.data : draftResult.data) as unknown as ProgramSchema;
  // Re-assert the review invariants on whichever object won.
  schema.metadata.is_active = false;

  return {
    schema,
    draftValid: true,
    removed: { edges: pruned.removedEdges, triggers: pruned.removedTriggers },
  };
}
