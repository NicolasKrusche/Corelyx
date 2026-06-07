import { describe, expect, it, vi } from "vitest";
import {
  buildClonedAgentSchema,
  gatherPriorReports,
  resolveLineageId,
} from "../agents/lineage";

// ─── Mock helper: queue-based Supabase client (mirrors agent-comprehensive) ──

function createMockService() {
  const results: Array<{ data: any; error: any }> = [];
  let callIndex = 0;

  const builder: any = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    filter: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    _queueResult: (data: any, error?: any) => {
      results.push({ data, error: error ?? null });
    },
  };
  builder.then = (onfulfilled: any, onrejected: any) => {
    const result = results[callIndex] ?? { data: null, error: null };
    callIndex++;
    return Promise.resolve(result).then(onfulfilled, onrejected);
  };
  return builder;
}

// ─── resolveLineageId ────────────────────────────────────────────────────────

describe("resolveLineageId", () => {
  it("returns the stamped lineage id when present", () => {
    const schema = { metadata: { agent_lineage_id: "lin-1" } };
    expect(resolveLineageId(schema, "prog-x")).toBe("lin-1");
  });

  it("falls back to the given id when missing", () => {
    expect(resolveLineageId({ metadata: {} }, "prog-x")).toBe("prog-x");
    expect(resolveLineageId(null, "prog-x")).toBe("prog-x");
    expect(resolveLineageId({}, "prog-x")).toBe("prog-x");
  });
});

// ─── buildClonedAgentSchema ──────────────────────────────────────────────────

describe("buildClonedAgentSchema", () => {
  it("stamps a fresh program_id, agent type, and lineage from the source id", () => {
    const source = { program_id: "old", program_type: "agent", nodes: [], metadata: { description: "x" } };
    const cloned = buildClonedAgentSchema(source, "src-1", "new-id");
    expect(cloned.program_id).toBe("new-id");
    expect(cloned.program_type).toBe("agent");
    const meta = cloned.metadata as Record<string, unknown>;
    expect(meta.agent_lineage_id).toBe("src-1");
    expect(meta.cloned_from).toBe("src-1");
    expect(meta.description).toBe("x"); // preserves existing metadata
  });

  it("inherits an existing lineage id so a chain of re-runs shares it", () => {
    const source = { metadata: { agent_lineage_id: "lin-root" } };
    const cloned = buildClonedAgentSchema(source, "src-2", "new-id");
    expect((cloned.metadata as Record<string, unknown>).agent_lineage_id).toBe("lin-root");
    expect((cloned.metadata as Record<string, unknown>).cloned_from).toBe("src-2");
  });

  it("does not mutate the source schema (deep copy)", () => {
    const source = { program_id: "old", metadata: { agent_lineage_id: "lin" }, nodes: [{ id: "n1" }] };
    const cloned = buildClonedAgentSchema(source, "src", "new");
    expect(source.program_id).toBe("old");
    (cloned.nodes as Array<{ id: string }>)[0].id = "changed";
    expect(source.nodes[0].id).toBe("n1");
  });

  it("handles a null source schema", () => {
    const cloned = buildClonedAgentSchema(null, "src", "new");
    expect(cloned.program_id).toBe("new");
    expect((cloned.metadata as Record<string, unknown>).agent_lineage_id).toBe("src");
  });
});

// ─── gatherPriorReports ──────────────────────────────────────────────────────

describe("gatherPriorReports", () => {
  it("with no lineage, returns the program's OWN prior reports (standing agent)", async () => {
    const svc = createMockService();
    // No lineage → skips the programs query; first execute is the reports query.
    svc._queueResult([
      { title: "Yesterday", body: "found 2 stale deals", created_at: "2026-06-06", dry_run: false, run_id: "run-old" },
    ]);
    const out = await gatherPriorReports(svc, "ws-1", "prog-cur", { metadata: {} });
    expect(out).toEqual([{ title: "Yesterday", body: "found 2 stale deals", created_at: "2026-06-06" }]);
  });

  it("returns empty when there are no prior reports at all", async () => {
    const svc = createMockService();
    svc._queueResult([]); // reports query empty
    const out = await gatherPriorReports(svc, "ws-1", "prog-cur", { metadata: {} });
    expect(out).toEqual([]);
  });

  it("excludes the current in-flight run", async () => {
    const svc = createMockService();
    svc._queueResult([
      { title: "Current", body: "in progress", created_at: "2026-06-07", dry_run: false, run_id: "run-now" },
      { title: "Prev", body: "did the thing", created_at: "2026-06-06", dry_run: false, run_id: "run-old" },
    ]);
    const out = await gatherPriorReports(svc, "ws-1", "prog-cur", { metadata: {} }, "run-now");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Prev");
  });

  it("merges lineage siblings, drops dry-runs/blanks, bounds to 3 and truncates", async () => {
    const svc = createMockService();
    svc._queueResult([{ id: "prog-cur" }, { id: "prog-clone" }]); // programs (lineage) query
    svc._queueResult([
      { title: "r1", body: "a", created_at: "2026-06-06", dry_run: false, run_id: "r1" },
      { title: null, body: "   ", created_at: "2026-06-05", dry_run: false, run_id: "r2" }, // blank dropped
      { title: "x".repeat(300), body: "y".repeat(5000), created_at: "2026-06-04", dry_run: false, run_id: "r3" },
      { title: "r4", body: "b", created_at: "2026-06-03", dry_run: false, run_id: "r4" },
      { title: "r5", body: "c", created_at: "2026-06-02", dry_run: false, run_id: "r5" },
    ]); // reports query
    const out = await gatherPriorReports(svc, "ws-1", "prog-cur", {
      metadata: { agent_lineage_id: "lin-1" },
    });
    expect(out).toHaveLength(3); // bounded after blank dropped
    expect(out[0].title).toBe("r1");
    expect(out[1].title.length).toBe(200); // truncated title
    expect(out[1].body.length).toBe(4000); // truncated body
  });
});
