import "server-only";

import { ProgramSchemaZ, type ProgramSchema } from "@flowos/schema";
import { createServiceClient } from "@/lib/api";
import {
  loadWorkflowProviderContext,
  loadWorkspaceComplianceSettings,
} from "@/lib/compliance/server";
import { generateComplianceExportReport } from "@/lib/compliance/workflow";
import {
  buildDpiaInputFromInventory,
  buildInventoryRecordFromProgram,
  generateDpiaDraft,
  type DpiaDraftInput,
  type ProgramInventorySource,
} from "@/lib/compliance/governance";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type DpiaProgramRow = ProgramInventorySource & {
  user_id: string;
  workspace_id: string;
  schema: unknown;
  schema_version: number | null;
};

const PROGRAM_DPIA_SELECT =
  "id, user_id, name, description, is_active, created_at, updated_at, schema, schema_version, workspace_id, ai_use_case_category, ai_act_risk_level, customer_role, human_oversight_required, transparency_notice_required, high_risk_documentation_required, prohibited_reason, reviewer, reviewed_at, ai_act_notes, legal_review_override";

export class ProgramDpiaSourceError extends Error {
  constructor(
    public readonly code: "PROGRAM_NOT_FOUND" | "WORKFLOW_NOT_RUNNABLE",
    message: string
  ) {
    super(message);
    this.name = "ProgramDpiaSourceError";
  }
}

export type GeneratedProgramDpia = {
  content: string;
  input: DpiaDraftInput;
  program: {
    id: string;
    schemaVersion: number | null;
    updatedAt: string | null;
  };
};

/** Build a DPIA draft only from the workflow's stored governance evidence. */
export async function generateProgramDpia(
  programId: string,
  db: LooseServiceClient = createServiceClient() as LooseServiceClient
): Promise<GeneratedProgramDpia> {
  const { data, error } = await db
    .from("programs")
    .select(PROGRAM_DPIA_SELECT)
    .eq("id", programId)
    .single();

  if (error || !data) {
    throw new ProgramDpiaSourceError("PROGRAM_NOT_FOUND", "Workflow not found.");
  }

  const program = data as DpiaProgramRow;
  const parsed = ProgramSchemaZ.safeParse(program.schema);
  if (!parsed.success) {
    throw new ProgramDpiaSourceError(
      "WORKFLOW_NOT_RUNNABLE",
      "Complete the workflow schema before generating its DPIA draft."
    );
  }

  const schema = parsed.data as unknown as ProgramSchema;
  const [workspace, context] = await Promise.all([
    loadWorkspaceComplianceSettings(program.workspace_id, db as never),
    loadWorkflowProviderContext(programId, program.workspace_id, db as never),
  ]);
  const report = generateComplianceExportReport({
    schema,
    workspace,
    context,
    program,
  });
  const inventoryRecord = buildInventoryRecordFromProgram({
    program,
    schema,
    flow: report.data_flow,
  });
  const input = buildDpiaInputFromInventory(inventoryRecord);

  return {
    content: generateDpiaDraft(input),
    input,
    program: {
      id: program.id,
      schemaVersion: program.schema_version,
      updatedAt: program.updated_at,
    },
  };
}
