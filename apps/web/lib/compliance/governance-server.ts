import { ProgramSchemaZ, type ProgramSchema } from "@flowos/schema";
import { createServiceClient } from "@/lib/api";
import {
  buildDataFlowPreview,
  type DataFlowPreviewItem,
  type AiActRiskLevel,
} from "@/lib/compliance/workflow";
import {
  buildInventoryRecordFromProgram,
  calculateGovernanceMetrics,
  type AiSystemInventoryRecord,
  type GovernanceDashboardMetrics,
  type ProgramInventorySource,
} from "@/lib/compliance/governance";
import {
  loadWorkflowProviderContext,
  loadWorkspaceComplianceSettings,
} from "@/lib/compliance/server";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type ProgramRow = ProgramInventorySource & {
  user_id: string;
  workspace_id: string;
  schema: unknown;
};

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
  const creatorEmailById = new Map<string, string>();

  if (creatorIds.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", creatorIds);
    for (const profile of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (profile.display_name) creatorEmailById.set(profile.id, profile.display_name);
    }
  }

  const workspace = await loadWorkspaceComplianceSettings(workspaceId, db);

  const records: AiSystemInventoryRecord[] = [];
  for (const program of programs) {
    const parsed = ProgramSchemaZ.safeParse(program.schema);
    let schema: ProgramSchema | null = null;
    let flow: DataFlowPreviewItem[] = [];
    if (parsed.success) {
      schema = parsed.data as unknown as ProgramSchema;
      const context = await loadWorkflowProviderContext(program.id, workspaceId, db);
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
