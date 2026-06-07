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
 * Gather agent reports from earlier runs of the same lineage (programs sharing
 * schema.metadata.agent_lineage_id), most recent first. Excludes the current
 * program and dry-run reports. Returns a small, bounded list for context.
 */
export async function gatherPriorReports(
  service: Service,
  workspaceId: string,
  currentProgramId: string,
  rawSchema: Record<string, unknown> | null
): Promise<PriorReport[]> {
  const metadata = (rawSchema?.metadata && typeof rawSchema.metadata === "object"
    ? rawSchema.metadata
    : {}) as Record<string, unknown>;
  const lineageId = typeof metadata.agent_lineage_id === "string" ? metadata.agent_lineage_id : null;
  if (!lineageId) return [];

  // Sibling agents in this workspace that share the lineage id.
  const { data: progRows } = await service
    .from("programs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("program_type", "agent")
    .filter("schema->metadata->>agent_lineage_id", "eq", lineageId);
  const programIds = ((progRows ?? []) as Array<{ id: string }>)
    .map((r) => r.id)
    .filter((pid) => pid !== currentProgramId);
  if (programIds.length === 0) return [];

  const { data: reportRows } = await service
    .from("agent_reports")
    .select("title, body, created_at, dry_run")
    .in("program_id", programIds)
    .eq("dry_run", false)
    .order("created_at", { ascending: false })
    .limit(3);

  return ((reportRows ?? []) as Array<{ title: string | null; body: string | null; created_at: string; dry_run: boolean }>)
    .map((r) => ({
      title: (r.title ?? "Report").slice(0, 200),
      body: (r.body ?? "").slice(0, 4000),
      created_at: r.created_at,
    }))
    .filter((r) => r.body.trim().length > 0);
}
