import { describe, it, expect } from "vitest";
import { neighborIdsFromLinks } from "../knowledge-search";

describe("neighborIdsFromLinks", () => {
  it("returns nothing when there are no links", () => {
    expect(neighborIdsFromLinks(["a"], [])).toEqual([]);
  });

  it("pulls in the neighbor when a matched doc links outward", () => {
    expect(neighborIdsFromLinks(["a"], [{ from_id: "a", to_id: "b" }])).toEqual(["b"]);
  });

  it("pulls in the neighbor regardless of link direction", () => {
    // matched doc is the target end → the source is the related doc
    expect(neighborIdsFromLinks(["b"], [{ from_id: "a", to_id: "b" }])).toEqual(["a"]);
  });

  it("excludes docs that already matched directly", () => {
    // both ends matched → no new neighbor to add
    expect(neighborIdsFromLinks(["a", "b"], [{ from_id: "a", to_id: "b" }])).toEqual([]);
  });

  it("de-dupes a neighbor reachable from multiple matches", () => {
    const links = [
      { from_id: "a", to_id: "c" },
      { from_id: "b", to_id: "c" },
    ];
    expect(neighborIdsFromLinks(["a", "b"], links)).toEqual(["c"]);
  });

  it("respects the cap", () => {
    const links = [
      { from_id: "a", to_id: "b" },
      { from_id: "a", to_id: "c" },
      { from_id: "a", to_id: "d" },
    ];
    expect(neighborIdsFromLinks(["a"], links, 2)).toEqual(["b", "c"]);
  });
});
