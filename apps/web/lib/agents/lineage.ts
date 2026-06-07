import type { createServiceClient } from "@/lib/api";

type Service = ReturnType<typeof createServiceClient> & { from(t: string): any };

export type PriorReport = { title: string; body: string; created_at: string };

/** Read the agent lineage id from a program schema, falling back to a program id. */
export function resolveLineageId(
  rawSchema: Record<string, unknown> | null | undefined,
  fallbackId: string
): string {
  const metadata = (rawSchema?.metadata && typeof rawSchema.metadata === "object"
    ? rawSchema.metadata
    : {}) as Record<string, unknown>;
  return typeof metadata.agent_lineage_id === "string" ? metadata.agent_lineage_id : fallbackId;
}

/**
 * Build the schema for a cloned one-time agent: a deep copy of the source plan
 * with a fresh program_id and lineage stamped into metadata. Lineage is
 * inherited if the source already has one, so a chain of re-runs shares it.
 */
export function buildClonedAgentSchema(
  sourceSchema: Record<string, unknown> | null | undefined,
  sourceId: string,
  newProgramId: string
): Record<string, unknown> {
  const schema = JSON.parse(JSON.stringify(sourceSchema ?? {})) as Record<string, unknown>;
  const metadata = (schema.metadata && typeof schema.metadata === "object"
    ? schema.metadata
    : {}) as Record<string, unknown>;
  const lineageId = resolveLineageId(schema, sourceId);
  schema.program_id = newProgramId;
  schema.program_type = "agent";
  schema.metadata = { ...metadata, agent_lineage_id: lineageId, cloned_from: sourceId };
  return schema;
}

/**
 * Gather agent reports from earlier runs of the same agent, most recent first,
 * for cross-run memory. Sources, both covered:
 *   1. This program's OWN prior runs — the standing-agent case (a triggered agent
 *      re-runs in place, so its history lives under the same program).
 *   2. Sibling programs sharing schema.metadata.agent_lineage_id — the manual
 *      "Run again" clone case.
 * Excludes the current (in-flight) run and dry-run reports. Bounded to 3.
 */
export async function gatherPriorReports(
  service: Service,
  workspaceId: string,
  currentProgramId: string,
  rawSchema: Record<string, unknown> | null,
  excludeRunId?: string
): Promise<PriorReport[]> {
  const metadata = (rawSchema?.metadata && typeof rawSchema.metadata === "object"
    ? rawSchema.metadata
    : {}) as Record<string, unknown>;
  const lineageId = typeof metadata.agent_lineage_id === "string" ? metadata.agent_lineage_id : null;

  const programIds = new Set<string>([currentProgramId]);
  if (lineageId) {
    const { data: progRows } = await service
      .from("programs")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("program_type", "agent")
      .filter("schema->metadata->>agent_lineage_id", "eq", lineageId);
    for (const r of (progRows ?? []) as Array<{ id: string }>) programIds.add(r.id);
  }

  const { data: reportRows } = await service
    .from("agent_reports")
    .select("title, body, created_at, dry_run, run_id")
    .in("program_id", [...programIds])
    .eq("dry_run", false)
    .order("created_at", { ascending: false })
    .limit(6);

  return ((reportRows ?? []) as Array<{ title: string | null; body: string | null; created_at: string; dry_run: boolean; run_id: string | null }>)
    .filter((r) => !excludeRunId || r.run_id !== excludeRunId)
    .map((r) => ({
      title: (r.title ?? "Report").slice(0, 200),
      body: (r.body ?? "").slice(0, 4000),
      created_at: r.created_at,
    }))
    .filter((r) => r.body.trim().length > 0)
    .slice(0, 3);
}
