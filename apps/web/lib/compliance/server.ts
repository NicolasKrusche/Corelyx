import { createServiceClient } from "@/lib/api";
import {
  DEFAULT_WORKSPACE_COMPLIANCE,
  mergeWorkspaceComplianceSettings,
  type WorkspaceComplianceSettings,
  type WorkflowProviderContext,
} from "@/lib/compliance/workflow";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

export async function loadWorkspaceComplianceSettings(
  workspaceId: string,
  db: LooseServiceClient = createServiceClient() as LooseServiceClient
): Promise<WorkspaceComplianceSettings> {
  const { data } = await db
    .from("workspaces")
    .select(
      "compliance_mode, execution_log_retention_days, prompt_retention_days, output_retention_days, approval_record_retention_days, secret_rotation_reminder_days, store_full_prompts, store_full_outputs, data_region"
    )
    .eq("id", workspaceId)
    .maybeSingle();

  return mergeWorkspaceComplianceSettings(
    (data ?? DEFAULT_WORKSPACE_COMPLIANCE) as Partial<WorkspaceComplianceSettings>
  );
}

export async function loadWorkflowProviderContext(
  programId: string,
  workspaceId: string,
  db: LooseServiceClient = createServiceClient() as LooseServiceClient
): Promise<WorkflowProviderContext> {
  const { data: linkedConns } = await db
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", programId);

  const connectionIds = ((linkedConns ?? []) as Array<{ connection_id: string }>).map(
    (row) => row.connection_id
  );

  let connections: WorkflowProviderContext["connections"] = [];
  if (connectionIds.length > 0) {
    const { data } = await db
      .from("connections")
      .select("id, name, provider, is_valid")
      .in("id", connectionIds)
      .eq("workspace_id", workspaceId);
    connections = (data ?? []) as WorkflowProviderContext["connections"];
  }

  const { data: apiKeys } = await db
    .from("api_keys")
    .select("id, name, provider, is_valid")
    .eq("workspace_id", workspaceId);

  return {
    connections,
    apiKeys: (apiKeys ?? []) as WorkflowProviderContext["apiKeys"],
  };
}
