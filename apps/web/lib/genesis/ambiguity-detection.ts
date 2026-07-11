// Deterministic clarifying-question detection — no model call, no model
// judgment. The model-authored `clarifications` sidecar (clarifications.ts)
// depends on the model choosing, on its own initiative, to flag a guess it
// made. Testing this session showed that initiative doesn't reliably fire
// even when the prompt explicitly describes the exact trigger case (a
// resolved node picking between several real same-kind resources) — a
// limitation of small/cheap models specifically, not a prompting problem.
//
// This scans the ALREADY-RESOLVED schema mechanically instead of hoping the
// model notices: for each write-scoped connection node, does its
// operation_params reference a capability placeholder from a category that
// had 2+ real candidates? If so, something had to be picked among options
// without the description narrowing it down — exactly what
// CLARIFICATIONS_PROMPT_SECTION describes as clarification-worthy, just
// caught in code instead of hoped for. Because it's mechanical, it doesn't
// have a model-strength ceiling: it works identically on a free model or a
// frontier one.
//
// Scoped to write/read_write nodes only, mirroring the product's existing
// philosophy that destructive/side-effecting operations get extra scrutiny
// (they already pause for runtime approval) — an ambiguous TARGET for one of
// those operations deserves the same treatment. Read-only ambiguity is
// lower-stakes and recoverable, so it's left to the model-authored path.
//
// Must run on the schema BEFORE pseudonymization rehydration — it matches
// against literal "[CATEGORY_N]" placeholder text, which a rehydrated real
// value would no longer contain.

import type { CapabilityDescriptor } from "@/lib/genesis/introspection";
import type { GenesisClarification } from "@/lib/genesis/clarifications";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Mirrors placeholderCategory in introspection.ts — must stay in sync since
// this matches against placeholders that function produces.
function placeholderCategory(provider: string, kind: string): string {
  return `${provider}_${kind}`.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/**
 * Category → real candidate count, derived from the same introspected data
 * used to build the prompt's capability sections. A category with 2+ real
 * resources means picking one is a genuine choice, not a formality.
 */
export function countCandidatesByCategory(descriptors: CapabilityDescriptor[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const descriptor of descriptors) {
    const kindCounts = new Map<string, number>();
    for (const resource of descriptor.resources) {
      kindCounts.set(resource.kind, (kindCounts.get(resource.kind) ?? 0) + 1);
    }
    for (const [kind, count] of kindCounts) {
      const category = placeholderCategory(descriptor.provider, kind);
      counts.set(category, (counts.get(category) ?? 0) + count);
    }
  }
  return counts;
}

const PLACEHOLDER_PATTERN = /\[([A-Z][A-Z0-9_]*)_\d+\]/g;

/** Every [CATEGORY_N] placeholder referenced anywhere in a value, recursively, deduped by category. */
function findReferencedCategories(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    for (const match of value.matchAll(PLACEHOLDER_PATTERN)) found.add(match[1]!);
  } else if (Array.isArray(value)) {
    for (const item of value) findReferencedCategories(item, found);
  } else if (isRecord(value)) {
    for (const v of Object.values(value)) findReferencedCategories(v, found);
  }
  return found;
}

/** "SLACK_CHANNEL" -> "Slack channel", "NOTION_DATABASE" -> "Notion database". */
function describeCategory(category: string): string {
  const parts = category.toLowerCase().split("_").filter(Boolean);
  if (parts.length === 0) return "resource";
  return parts.map((p, i) => (i === 0 ? p[0]!.toUpperCase() + p.slice(1) : p)).join(" ");
}

export interface AmbiguousTarget {
  nodeId: string;
  nodeLabel: string;
  category: string;
  candidateCount: number;
}

/**
 * Scans a resolved (still-pseudonymized) schema for write-scoped connection
 * nodes whose operation_params reference an ambiguous (2+ candidate)
 * capability category. One flag per node maximum, even if multiple params
 * reference different ambiguous categories — avoids stacking several
 * questions onto a single node.
 */
export function findAmbiguousTargets(
  rawSchema: unknown,
  descriptors: CapabilityDescriptor[]
): AmbiguousTarget[] {
  if (!isRecord(rawSchema) || !Array.isArray(rawSchema.nodes)) return [];
  const candidateCounts = countCandidatesByCategory(descriptors);
  if (candidateCounts.size === 0) return [];

  const results: AmbiguousTarget[] = [];
  for (const node of rawSchema.nodes) {
    if (!isRecord(node) || node.type !== "connection") continue;
    const config = node.config;
    if (!isRecord(config)) continue;
    if (config.scope_access !== "write" && config.scope_access !== "read_write") continue;
    const nodeId = typeof node.id === "string" ? node.id : null;
    if (!nodeId) continue;

    for (const category of findReferencedCategories(config.operation_params)) {
      const count = candidateCounts.get(category);
      if (count && count >= 2) {
        const nodeLabel = typeof node.label === "string" && node.label ? node.label : nodeId;
        results.push({ nodeId, nodeLabel, category, candidateCount: count });
        break;
      }
    }
  }
  return results;
}

/** Builds a plain, deterministic clarifying question — no model call. */
export function buildAmbiguityClarification(target: AmbiguousTarget): GenesisClarification {
  const resourceLabel = describeCategory(target.category);
  return {
    node_id: target.nodeId,
    question: `"${target.nodeLabel}" could target any of ${target.candidateCount} ${resourceLabel} options in your account — which one should it use?`,
    blocked_node_ids: [],
  };
}
