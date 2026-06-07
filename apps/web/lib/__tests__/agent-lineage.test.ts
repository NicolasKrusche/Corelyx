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
  it("returns empty when the schema has no lineage id", async () => {
    const svc = createMockService();
    const out = await gatherPriorReports(svc, "ws-1", "prog-cur", { metadata: {} });
    expect(out).toEqual([]);
    expect(svc.from).not.toHaveBeenCalled();
  });

  it("returns empty when no sibling programs share the lineage", async () => {
    const svc = createMockService();
    svc._queueResult([{ id: "prog-cur" }]); // only the current program
    const out = await gatherPriorReports(svc, "ws-1", "prog-cur", {
      metadata: { agent_lineage_id: "lin-1" },
    });
    expect(out).toEqual([]);
  });

  it("collects non-dry-run reports from sibling programs, bounded and trimmed", async () => {
    const svc = createMockService();
    svc._queueResult([{ id: "prog-cur" }, { id: "prog-old" }]); // programs query
    svc._queueResult([
      { title: "Last run", body: "found 3 stale deals", created_at: "2026-06-01", dry_run: false },
      { title: null, body: "  ", created_at: "2026-05-01", dry_run: false }, // blank body dropped
      { title: "x".repeat(300), body: "y".repeat(5000), created_at: "2026-04-01", dry_run: false },
    ]); // reports query
    const out = await gatherPriorReports(svc, "ws-1", "prog-cur", {
      metadata: { agent_lineage_id: "lin-1" },
    });
    expect(out).toHaveLength(2); // blank body filtered out
    expect(out[0]).toEqual({ title: "Last run", body: "found 3 stale deals", created_at: "2026-06-01" });
    expect(out[1].title.length).toBe(200); // title truncated
    expect(out[1].body.length).toBe(4000); // body truncated
  });
});
