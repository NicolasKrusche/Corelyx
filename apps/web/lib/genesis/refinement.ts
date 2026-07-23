/**
 * Genesis Iterative Refinement Loop
 *
 * Manages multi-round refinement sessions: takes a Genesis result, accepts
 * iterative user feedback, sends it to the LLM with full context, and returns
 * an updated schema. Enforces max 3 iterations per session for cost control
 * and stores full session history for AI Act Art. 50 transparency.
 *
 * This module is client-safe (no server imports) and runs inside "use client"
 * components.
 */

import type { ProgramSchema } from "@flowos/schema";
import { diffSchemas, type GenesisPatchSummary } from "@/lib/genesis/patch";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum refinement iterations per session. */
export const MAX_REFINEMENT_ITERATIONS = 3;

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single refinement iteration within a session. */
export interface RefinementIteration {
  /** 1-based iteration number. */
  iteration: number;
  /** User feedback that triggered this iteration. */
  feedback: string;
  /** Schema snapshot before the refinement was applied. */
  previousSchema: ProgramSchema;
  /** Schema returned by the LLM after refinement. */
  resultSchema: ProgramSchema;
  /** Deterministic diff between previous and result. */
  diff: GenesisPatchSummary;
  /** ISO 8601 timestamp of when this iteration completed. */
  timestamp: string;
  /** Model that produced this refinement. */
  model: string;
}

/** Full refinement session state. */
export interface RefinementSession {
  /** Stable session identifier (uuid). */
  id: string;
  /** The program being refined. */
  programId: string;
  /** Original description used for Genesis. */
  originalDescription: string;
  /** Available connection ids for context. */
  connectionIds: string[];
  /** Iterations completed so far. */
  iterations: RefinementIteration[];
  /** The latest schema (starts as the initial generation result). */
  currentSchema: ProgramSchema;
  /** Model used for refinements. */
  model: string;
  /** Session creation timestamp. */
  createdAt: string;
}

/** Result returned after a refinement round. */
export interface RefinementResult {
  /** The updated schema from the LLM. */
  schema: ProgramSchema;
  /** Diff summary computed deterministically. */
  diff: GenesisPatchSummary;
  /** The iteration number that produced this result. */
  iteration: number;
  /** Whether the maximum iteration count has been reached. */
  atLimit: boolean;
  /** The model used. */
  model: string;
}

/** Serializable record of a refinement session for AI Act Art. 50. */
export interface RefinementTransparencyRecord {
  sessionId: string;
  programId: string;
  originalDescription: string;
  createdAt: string;
  iterations: Array<{
    iteration: number;
    feedback: string;
    timestamp: string;
    model: string;
    diffSummary: {
      addedNodes: string[];
      updatedNodes: string[];
      removedNodes: string[];
      addedEdges: string[];
      updatedEdges: string[];
      removedEdges: string[];
      changeDescription: string | null;
    };
  }>;
}

// ─── Session lifecycle ───────────────────────────────────────────────────────

/**
 * Create a new refinement session from an initial Genesis result.
 */
export function createRefinementSession(params: {
  programId: string;
  originalDescription: string;
  connectionIds: string[];
  initialSchema: ProgramSchema;
  model: string;
}): RefinementSession {
  return {
    id: crypto.randomUUID(),
    programId: params.programId,
    originalDescription: params.originalDescription,
    connectionIds: params.connectionIds,
    iterations: [],
    currentSchema: params.initialSchema,
    model: params.model,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Check whether a session can accept another refinement round.
 */
export function canRefine(session: RefinementSession): boolean {
  return session.iterations.length < MAX_REFINEMENT_ITERATIONS;
}

/**
 * Returns the number of remaining refinement rounds.
 */
export function remainingIterations(session: RefinementSession): number {
  return Math.max(0, MAX_REFINEMENT_ITERATIONS - session.iterations.length);
}

/**
 * Build the request body to send to POST /api/genesis for a refinement round.
 * Returns a plain object suitable for JSON.stringify.
 */
export function buildRefinementRequestBody(
  session: RefinementSession,
  feedback: string
): Record<string, unknown> {
  return {
    description: session.originalDescription,
    connection_ids: session.connectionIds,
    use_platform_key: true,
    existing_schema: session.currentSchema,
    refinement: feedback,
    existing_program_id: session.programId,
  };
}

/**
 * Process a refinement result: compute the diff, record the iteration, and
 * return an updated session + result summary. Pure — does not mutate the
 * input session.
 */
export function processRefinementResult(
  session: RefinementSession,
  feedback: string,
  resultSchema: ProgramSchema,
  model?: string
): { session: RefinementSession; result: RefinementResult } {
  const iteration = session.iterations.length + 1;
  const diff = diffSchemas(session.currentSchema, resultSchema);

  const completedIteration: RefinementIteration = {
    iteration,
    feedback,
    previousSchema: session.currentSchema,
    resultSchema,
    diff,
    timestamp: new Date().toISOString(),
    model: model ?? session.model,
  };

  const updatedSession: RefinementSession = {
    ...session,
    iterations: [...session.iterations, completedIteration],
    currentSchema: resultSchema,
  };

  const atLimit = !canRefine(updatedSession);

  return {
    session: updatedSession,
    result: {
      schema: resultSchema,
      diff,
      iteration,
      atLimit,
      model: model ?? session.model,
    },
  };
}

// ─── Transparency (AI Act Art. 50) ──────────────────────────────────────────

/**
 * Build a serializable transparency record from a refinement session.
 * This captures the full audit trail: what the user asked, what the AI changed,
 * when, and with which model. Intended for storage in the program's metadata
 * or a dedicated audit log.
 */
export function buildTransparencyRecord(
  session: RefinementSession
): RefinementTransparencyRecord {
  return {
    sessionId: session.id,
    programId: session.programId,
    originalDescription: session.originalDescription,
    createdAt: session.createdAt,
    iterations: session.iterations.map((iter) => ({
      iteration: iter.iteration,
      feedback: iter.feedback,
      timestamp: iter.timestamp,
      model: iter.model,
      diffSummary: {
        addedNodes: iter.diff.added_node_ids,
        updatedNodes: iter.diff.updated_node_ids,
        removedNodes: iter.diff.removed_node_ids,
        addedEdges: iter.diff.added_edge_ids,
        updatedEdges: iter.diff.updated_edge_ids,
        removedEdges: iter.diff.removed_edge_ids,
        changeDescription: iter.diff.change_summary,
      },
    })),
  };
}

/**
 * Generate a human-readable summary of all changes across iterations.
 * Useful for the transparency notice and the RefinementPanel history view.
 */
export function summarizeAllChanges(session: RefinementSession): string[] {
  const summaries: string[] = [];
  for (const iter of session.iterations) {
    const parts: string[] = [];
    if (iter.diff.added_node_ids.length > 0)
      parts.push(`Added ${iter.diff.added_node_ids.length} node(s)`);
    if (iter.diff.updated_node_ids.length > 0)
      parts.push(`Updated ${iter.diff.updated_node_ids.length} node(s)`);
    if (iter.diff.removed_node_ids.length > 0)
      parts.push(`Removed ${iter.diff.removed_node_ids.length} node(s)`);
    if (iter.diff.added_edge_ids.length > 0)
      parts.push(`Added ${iter.diff.added_edge_ids.length} connection(s)`);
    if (iter.diff.updated_edge_ids.length > 0)
      parts.push(`Updated ${iter.diff.updated_edge_ids.length} connection(s)`);
    if (iter.diff.removed_edge_ids.length > 0)
      parts.push(`Removed ${iter.diff.removed_edge_ids.length} connection(s)`);

    const label =
      parts.length > 0 ? parts.join(", ") : iter.diff.change_summary ?? "No structural changes";
    summaries.push(`Round ${iter.iteration}: ${label} — "${iter.feedback}"`);
  }
  return summaries;
}

// ─── Quick actions ───────────────────────────────────────────────────────────

/** Predefined quick-action prompts for the refinement panel. */
export const QUICK_ACTIONS: Array<{
  id: string;
  label: string;
  feedback: string;
}> = [
  {
    id: "add-error-handling",
    label: "Error Handling hinzufügen",
    feedback:
      "Add error handling: for every step that could fail (API calls, data transforms), add a branch that catches errors and sends a notification or fallback message instead of stopping the workflow silently.",
  },
  {
    id: "remove-node",
    label: "Node entfernen",
    feedback:
      "Remove the last added node that seems unnecessary and reconnect the surrounding nodes so the workflow stays connected.",
  },
  {
    id: "switch-connection",
    label: "Connection wechseln",
    feedback:
      "Switch the primary integration to a different provider where possible — prefer alternatives that are more widely used or better suited for this use case.",
  },
];

export type QuickActionId = string;

/**
 * Get the feedback string for a quick action by its id.
 */
export function getQuickActionFeedback(actionId: QuickActionId): string {
  const action = QUICK_ACTIONS.find((a) => a.id === actionId);
  return action?.feedback ?? "";
}

// ─── Local storage persistence ───────────────────────────────────────────────
// Refinement history is persisted in localStorage under a namespaced key so
// the transparency record survives page reloads. This is a supplement to any
// server-side audit log — the canonical record should be stored server-side
// when the program is saved.

const STORAGE_KEY_PREFIX = "corelyx-refinement-history";

function storageKey(programId: string): string {
  return `${STORAGE_KEY_PREFIX}:${programId}`;
}

/**
 * Persist a refinement session's transparency record to localStorage.
 */
export function persistRefinementHistory(session: RefinementSession): void {
  if (typeof window === "undefined") return;
  try {
    const record = buildTransparencyRecord(session);
    const key = storageKey(session.programId);
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Storage full or unavailable — non-critical, silently ignore.
  }
}

/**
 * Load a previously persisted transparency record for a program.
 */
export function loadRefinementHistory(
  programId: string
): RefinementTransparencyRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(programId));
    if (!raw) return null;
    return JSON.parse(raw) as RefinementTransparencyRecord;
  } catch {
    return null;
  }
}

/**
 * Clear persisted refinement history for a program.
 */
export function clearRefinementHistory(programId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(programId));
  } catch {
    // Non-critical.
  }
}
