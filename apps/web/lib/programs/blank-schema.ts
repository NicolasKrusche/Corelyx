import type { ProgramSchema } from "@flowos/schema";

export const DEFAULT_BLANK_PROGRAM_NAME = "Untitled program";

type BuildBlankProgramSchemaOptions = {
  programId?: string;
  name?: string;
  description?: string;
  now?: string;
};

export function buildBlankProgramSchema(
  options: BuildBlankProgramSchemaOptions = {}
): ProgramSchema {
  const now = options.now ?? new Date().toISOString();
  const programId = options.programId ?? crypto.randomUUID();
  const name = options.name?.trim() || DEFAULT_BLANK_PROGRAM_NAME;
  const description = options.description?.trim() ?? "";

  return {
    version: "1.0",
    program_id: programId,
    program_name: name,
    created_at: now,
    updated_at: now,
    execution_mode: "supervised",
    nodes: [],
    edges: [],
    triggers: [],
    version_history: [],
    metadata: {
      description,
      genesis_model: "manual",
      genesis_timestamp: now,
      tags: [],
      is_active: false,
      last_run_id: null,
      last_run_status: null,
      last_run_timestamp: null,
    },
  };
}
