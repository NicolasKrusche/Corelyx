import { describe, expect, it } from "vitest";
import { ProgramSchemaZ } from "@flowos/schema";
import { PREMADE_BROWSE_PROGRAMS } from "@/lib/browse-programs";

describe("browse premade programs", () => {
  it("ships 20 valid forkable schemas", () => {
    expect(PREMADE_BROWSE_PROGRAMS).toHaveLength(20);

    for (const program of PREMADE_BROWSE_PROGRAMS) {
      const parsed = ProgramSchemaZ.safeParse(program.schema);
      expect(parsed.success, program.id).toBe(true);
      expect(program.node_summary.total).toBe(program.schema?.nodes.length);
      expect(program.node_summary.connections_needed.length).toBeGreaterThan(0);
    }
  });
});
