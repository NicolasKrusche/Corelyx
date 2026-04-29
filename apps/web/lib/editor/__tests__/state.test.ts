import { describe, expect, it } from "vitest";
import type { ProgramSchema } from "@flowos/schema";
import { editorReducer, initialEditorState } from "../state";

const baseSchema: ProgramSchema = {
  version: "1.0",
  program_id: "program-1",
  program_name: "Untitled program",
  created_at: "2026-04-29T00:00:00.000Z",
  updated_at: "2026-04-29T00:00:00.000Z",
  execution_mode: "supervised",
  nodes: [],
  edges: [],
  triggers: [],
  version_history: [],
  metadata: {
    description: "",
    genesis_model: "",
    genesis_timestamp: "2026-04-29T00:00:00.000Z",
    tags: [],
    is_active: false,
    last_run_id: null,
    last_run_status: null,
    last_run_timestamp: null,
  },
};

describe("editorReducer title rename", () => {
  it("updates the program name and marks the draft dirty", () => {
    const state = initialEditorState(baseSchema);

    const next = editorReducer(state, { type: "UPDATE_PROGRAM_NAME", name: "Invoice triage" });

    expect(next.schema.program_name).toBe("Invoice triage");
    expect(next.isDirty).toBe(true);
    expect(next.past).toHaveLength(1);
  });

  it("normalizes empty names to Untitled program", () => {
    const state = initialEditorState({ ...baseSchema, program_name: "Existing name" });

    const next = editorReducer(state, { type: "UPDATE_PROGRAM_NAME", name: "   " });

    expect(next.schema.program_name).toBe("Untitled program");
  });
});
