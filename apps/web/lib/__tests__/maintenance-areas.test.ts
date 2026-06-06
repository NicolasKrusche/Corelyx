import { describe, expect, it } from "vitest";
import {
  matchDisabledArea,
  activeDisabledAreaKeys,
  MAINTENANCE_AREAS,
} from "@/lib/maintenance-areas";
import { DEFAULT_SYSTEM_FLAGS, type SystemFlags } from "@/lib/system-flags";

function flags(patch: Partial<SystemFlags>): SystemFlags {
  return { ...DEFAULT_SYSTEM_FLAGS, ...patch };
}

describe("activeDisabledAreaKeys", () => {
  it("is empty by default", () => {
    expect(activeDisabledAreaKeys(DEFAULT_SYSTEM_FLAGS)).toEqual([]);
  });

  it("merges the legacy genesis/execution booleans into the area set", () => {
    const keys = activeDisabledAreaKeys(flags({ disableGenesis: true, disableExecution: true }));
    expect(keys).toContain("genesis");
    expect(keys).toContain("execution");
  });

  it("drops unknown area keys", () => {
    expect(activeDisabledAreaKeys(flags({ disabledAreas: ["editor", "nonsense"] }))).toEqual(["editor"]);
  });

  it("does not duplicate an area set both ways", () => {
    const keys = activeDisabledAreaKeys(flags({ disabledAreas: ["genesis"], disableGenesis: true }));
    expect(keys.filter((k) => k === "genesis")).toHaveLength(1);
  });
});

describe("matchDisabledArea", () => {
  it("returns null when nothing is disabled", () => {
    expect(matchDisabledArea(DEFAULT_SYSTEM_FLAGS, "/api/runs", "POST")).toBeNull();
  });

  it("blocks a page route owned by a disabled area", () => {
    const area = matchDisabledArea(flags({ disabledAreas: ["editor"] }), "/programs/abc/editor", "GET");
    expect(area?.key).toBe("editor");
  });

  it("does not block routes outside the disabled area", () => {
    expect(matchDisabledArea(flags({ disabledAreas: ["editor"] }), "/dashboard", "GET")).toBeNull();
  });

  it("respects the method constraint for execution (blocks writes, allows reads)", () => {
    const f = flags({ disabledAreas: ["execution"] });
    expect(matchDisabledArea(f, "/api/runs", "POST")?.key).toBe("execution");
    expect(matchDisabledArea(f, "/api/runs", "GET")).toBeNull();
    expect(matchDisabledArea(f, "/api/agents/123/run", "post")?.key).toBe("execution");
  });

  it("every registered area has at least one prefix", () => {
    for (const area of MAINTENANCE_AREAS) {
      expect(area.prefixes.length).toBeGreaterThan(0);
    }
  });
});
