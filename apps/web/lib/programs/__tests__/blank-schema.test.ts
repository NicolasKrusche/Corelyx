import { describe, expect, it } from "vitest";
import { ProgramSchemaZ } from "@flowos/schema";
import {
  DEFAULT_BLANK_PROGRAM_NAME,
  buildBlankProgramSchema,
} from "@/lib/programs/blank-schema";

describe("buildBlankProgramSchema", () => {
  it("creates a valid empty schema for manual editing", () => {
    const now = "2026-04-27T10:15:00.000Z";
    const schema = buildBlankProgramSchema({
      programId: "prog-manual-1",
      name: "My Manual Workflow",
      description: "Built by hand",
      now,
    });

    expect(ProgramSchemaZ.safeParse(schema).success).toBe(true);
    expect(schema.program_id).toBe("prog-manual-1");
    expect(schema.program_name).toBe("My Manual Workflow");
    expect(schema.execution_mode).toBe("supervised");
    expect(schema.nodes).toEqual([]);
    expect(schema.edges).toEqual([]);
    expect(schema.triggers).toEqual([]);
    expect(schema.metadata.description).toBe("Built by hand");
    expect(schema.metadata.genesis_model).toBe("manual");
    expect(schema.metadata.genesis_timestamp).toBe(now);
  });

  it("falls back to the default untitled name", () => {
    const schema = buildBlankProgramSchema({ name: "   " });

    expect(schema.program_name).toBe(DEFAULT_BLANK_PROGRAM_NAME);
  });
});
