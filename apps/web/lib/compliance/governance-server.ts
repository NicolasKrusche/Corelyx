import { ProgramSchemaZ, type ProgramSchema } from "@flowos/schema";
import { createServiceClient } from "@/lib/api";
import {
  buildDataFlowPreview,
  type DataFlowPreviewItem,
  type AiActRiskLevel,
  type WorkflowProviderContext,
} from "@/lib/compliance/workflow";
import {
  buildInventoryRecordFromProgram,
  calculateGovernanceMetrics,
  type AiSystemInventoryRecord,
  type GovernanceDashboardMetrics,
  type ProgramInventorySource,
} from "@/lib/compliance/governance";
import { loadWorkspaceComplianceSettings } from "@/lib/compliance/server";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type ProgramRow = ProgramInventorySource & {
  user_id: string;
  workspace_id: string;
  schema: unknown;
};

const IN_CHUNK = 300;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type GovernanceInventoryBundle = {
  records: AiSystemInventoryRecord[];
  metrics: GovernanceDashboardMetrics;
  executionLogRetentionDays: number;
  generatedAt: string;
};

export async function loadGovernanceInventory(
  workspaceId: string,
  db: LooseServiceClient = createServiceClient() as LooseServiceClient
): Promise<GovernanceInventoryBundle> {
  const { data: programsRaw, error } = await db
    .from("programs")
    .select(
      "id, user_id, workspace_id, name, description, is_active, created_at, updated_at, schema, schema_version, ai_use_case_category, ai_act_risk_level, human_oversight_required, transparency_notice_required, high_risk_documentation_required, reviewer, reviewed_at, ai_act_notes"
    )
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to load governance inventory: ${error.message}`);

  const programs = (programsRaw ?? []) as ProgramRow[];
  const creatorIds = [...new Set(programs.map((program) => program.user_id))];
  const programIds = programs.map((program) => program.id);

  // Everything the per-program records need, fetched in one parallel wave —
  // never per program. (This page used to issue 2-3 queries per workflow,
  // which made the whole governance section crawl on real workspaces.)
  const [workspace, profilesRes, apiKeysRes, connectionsRes, linkRows] = await Promise.all([
    loadWorkspaceComplianceSettings(workspaceId, db),
    creatorIds.length > 0
      ? db.from("profiles").select("id, display_name").in("id", creatorIds)
      : Promise.resolve({ data: [] }),
    db.from("api_keys").select("id, name, provider, is_valid").eq("workspace_id", workspaceId),
    db.from("connections").select("id, name, provider, is_valid").eq("workspace_id", workspaceId),
    (async () => {
      const rows: Array<{ program_id: string; connection_id: string }> = [];
      for (const group of chunk(programIds, IN_CHUNK)) {
        const { data } = await db
          .from("program_connections")
          .select("program_id, connection_id")
          .in("program_id", group);
        rows.push(...((data ?? []) as Array<{ program_id: string; connection_id: string }>));
      }
      return rows;
    })(),
  ]);

  const creatorEmailById = new Map<string, string>();
  for (const profile of (profilesRes.data ?? []) as Array<{ id: string; display_name: string | null }>) {
    if (profile.display_name) creatorEmailById.set(profile.id, profile.display_name);
  }

  type ContextConnection = NonNullable<WorkflowProviderContext["connections"]>[number];
  const apiKeys = (apiKeysRes.data ?? []) as NonNullable<WorkflowProviderContext["apiKeys"]>;
  const connections = (connectionsRes.data ?? []) as Array<ContextConnection & { id: string }>;
  const connectionById = new Map(connections.map((c) => [c.id, c]));
  const connectionIdsByProgram = new Map<string, string[]>();
  for (const link of linkRows) {
    const list = connectionIdsByProgram.get(link.program_id) ?? [];
    list.push(link.connection_id);
    connectionIdsByProgram.set(link.program_id, list);
  }

  const records: AiSystemInventoryRecord[] = [];
  for (const program of programs) {
    const parsed = ProgramSchemaZ.safeParse(program.schema);
    let schema: ProgramSchema | null = null;
    let flow: DataFlowPreviewItem[] = [];
    if (parsed.success) {
      schema = parsed.data as unknown as ProgramSchema;
      const context: WorkflowProviderContext = {
        connections: (connectionIdsByProgram.get(program.id) ?? [])
          .map((id) => connectionById.get(id))
          .filter((c): c is NonNullable<typeof c> => Boolean(c)),
        apiKeys,
      };
      flow = buildDataFlowPreview(schema, workspace, context);
    }

    records.push(
      buildInventoryRecordFromProgram({
        program: {
          ...program,
          ai_act_risk_level: program.ai_act_risk_level as AiActRiskLevel | null,
        },
        schema,
        flow,
        creatorEmail: creatorEmailById.get(program.user_id) ?? null,
      })
    );
  }

  return {
    records,
    metrics: calculateGovernanceMetrics(records),
    executionLogRetentionDays: workspace.execution_log_retention_days,
    generatedAt: new Date().toISOString(),
  };
}
