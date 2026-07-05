import { describe, it, expect, vi, beforeEach } from "vitest";

/* Minimal chainable Supabase-query fake. Each call chain resolves via the
   handler registered for its table + operation. */
type Resolver = (op: string, payload: unknown) => { data: unknown; error: unknown };
const resolvers = new Map<string, Resolver>();

function fakeQuery(table: string, op: string, payload: unknown) {
  const state = { op, payload };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["select", "eq", "lte", "order", "limit"]) {
    chain[m] = (...args: unknown[]) => {
      if (m === "select" && state.op === "update") state.op = "update-select";
      void args;
      return self();
    };
  }
  chain.single = () => resolve();
  chain.then = (onOk: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onOk);
  function resolve() {
    const r = resolvers.get(`${table}:${state.op}`);
    if (!r) return { data: null, error: { message: `no resolver for ${table}:${state.op}` } };
    return r(state.op, state.payload);
  }
  return chain;
}

const fakeDb = {
  from: (table: string) => ({
    select: (...args: unknown[]) => fakeQuery(table, "select", args),
    update: (payload: unknown) => fakeQuery(table, "update", payload),
    insert: (payload: unknown) => fakeQuery(table, "insert", payload),
  }),
};

vi.mock("@/lib/api", () => ({ createServiceClient: () => fakeDb }));
vi.mock("@/lib/limits", () => ({ checkRunLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/compliance", () => ({ getProcessingRestriction: vi.fn(async () => ({ restricted: false })) }));
vi.mock("@/lib/runtime-url", () => ({ getRuntimeUrl: () => "http://runtime.test" }));
vi.mock("@/lib/runtime-dispatch", () => ({
  buildRuntimeExecuteHeaders: () => ({}),
  formatRuntimeRejection: (e: { detail: string }) => e.detail,
  isRuntimeDispatchConfigError: () => false,
  readRuntimeRejectionDetails: async () => ({ status: 500, detail: "boom" }),
}));
vi.mock("@/lib/trigger-events", () => ({ recordTriggerEvent: vi.fn() }));
vi.mock("@/lib/agents/dispatch", () => ({ fireAgentTrigger: vi.fn() }));

import { computeNextRun, sweepDueCronTriggers } from "@/lib/cron-sweep";
import { recordTriggerEvent } from "@/lib/trigger-events";

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

const TRIGGER = {
  id: "trig-1",
  program_id: "prog-1",
  config: { expression: "0 9 * * *", timezone: "UTC" },
  // One hour overdue — inside the 24h catch-up window, so it must fire.
  next_run_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
};

beforeEach(() => {
  resolvers.clear();
  vi.clearAllMocks();
});

describe("computeNextRun", () => {
  it("returns the next occurrence in the future", () => {
    const from = new Date("2026-07-05T10:00:00Z");
    expect(computeNextRun("0 9 * * *", "UTC", from)).toBe("2026-07-06T09:00:00.000Z");
  });

  it("respects the timezone", () => {
    const from = new Date("2026-07-05T10:00:00Z");
    // 09:00 Vienna in July is 07:00 UTC.
    expect(computeNextRun("0 9 * * *", "Europe/Vienna", from)).toBe("2026-07-06T07:00:00.000Z");
  });

  it("returns null for invalid expressions instead of throwing", () => {
    expect(computeNextRun("not a cron", "UTC")).toBeNull();
    expect(computeNextRun(undefined, "UTC")).toBeNull();
    expect(computeNextRun("", "UTC")).toBeNull();
  });

  it("skips far-overdue occurrences and lands on a future time (catch-up fires once)", () => {
    // A trigger overdue since June still advances to the NEXT future slot.
    const from = new Date("2026-07-05T10:00:00Z");
    const next = computeNextRun("0 15 * * 1-5", "UTC", from)!;
    expect(new Date(next).getTime()).toBeGreaterThan(from.getTime());
  });
});

describe("sweepDueCronTriggers — atomic claim", () => {
  it("skips a trigger another scheduler already claimed (0 rows updated)", async () => {
    resolvers.set("triggers:select", () => ({ data: [TRIGGER], error: null }));
    resolvers.set("triggers:update-select", () => ({ data: [], error: null })); // lost the race

    const result = await sweepDueCronTriggers(silentLogger);
    expect(result).toEqual({ checked: 1, fired: 0, skipped: 1, failed: 0 });
    expect(recordTriggerEvent).not.toHaveBeenCalled();
  });

  it("claims, dispatches to the runtime, and reports fired", async () => {
    resolvers.set("triggers:select", () => ({ data: [TRIGGER], error: null }));
    resolvers.set("triggers:update-select", (_op, payload) => {
      // The claim must advance next_run_at into the future and stamp last_fired_at.
      const patch = payload as { next_run_at: string | null; last_fired_at: string };
      expect(patch.last_fired_at).toBeTruthy();
      expect(patch.next_run_at && new Date(patch.next_run_at).getTime()).toBeGreaterThan(Date.now());
      return { data: [{ id: TRIGGER.id }], error: null };
    });
    resolvers.set("programs:select", () => ({
      data: { id: "prog-1", schema: {}, user_id: "u1", workspace_id: "w1", execution_mode: "autonomous", program_type: "workflow" },
      error: null,
    }));
    resolvers.set("runs:insert", () => ({ data: { id: "run-1" }, error: null }));
    resolvers.set("program_connections:select", () => ({ data: [], error: null }));

    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await sweepDueCronTriggers(silentLogger);
    expect(result).toEqual({ checked: 1, fired: 1, skipped: 0, failed: 0 });
    expect(fetchMock).toHaveBeenCalledWith("http://runtime.test/execute", expect.anything());
    expect(recordTriggerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dispatched", runId: "run-1" })
    );
    vi.unstubAllGlobals();
  });

  it("marks the run failed when the runtime rejects, but never re-fires (already advanced)", async () => {
    const updates: unknown[] = [];
    resolvers.set("triggers:select", () => ({ data: [TRIGGER], error: null }));
    resolvers.set("triggers:update-select", () => ({ data: [{ id: TRIGGER.id }], error: null }));
    resolvers.set("programs:select", () => ({
      data: { id: "prog-1", schema: {}, user_id: "u1", workspace_id: "w1", execution_mode: "autonomous", program_type: "workflow" },
      error: null,
    }));
    resolvers.set("runs:insert", () => ({ data: { id: "run-9" }, error: null }));
    resolvers.set("runs:update", (_op, payload) => {
      updates.push(payload);
      return { data: null, error: null };
    });
    resolvers.set("program_connections:select", () => ({ data: [], error: null }));

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));

    const result = await sweepDueCronTriggers(silentLogger);
    expect(result.failed).toBe(1);
    expect(updates[0]).toMatchObject({ status: "failed" });
    expect(recordTriggerEvent).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    vi.unstubAllGlobals();
  });

  it("returns immediately when nothing is due", async () => {
    resolvers.set("triggers:select", () => ({ data: [], error: null }));
    const result = await sweepDueCronTriggers(silentLogger);
    expect(result).toEqual({ checked: 0, fired: 0, skipped: 0, failed: 0 });
  });

  it("advances but does not fire an occurrence missed by more than 24h", async () => {
    const stale = {
      ...TRIGGER,
      next_run_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    };
    resolvers.set("triggers:select", () => ({ data: [stale], error: null }));
    resolvers.set("triggers:update-select", () => ({ data: [{ id: stale.id }], error: null }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sweepDueCronTriggers(silentLogger);
    expect(result).toEqual({ checked: 1, fired: 0, skipped: 1, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordTriggerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped", message: expect.stringContaining("too old") })
    );
    vi.unstubAllGlobals();
  });

  it("fires an occurrence missed by less than 24h (the stuck-20h case)", async () => {
    const recent = {
      ...TRIGGER,
      next_run_at: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    };
    resolvers.set("triggers:select", () => ({ data: [recent], error: null }));
    resolvers.set("triggers:update-select", () => ({ data: [{ id: recent.id }], error: null }));
    resolvers.set("programs:select", () => ({
      data: { id: "prog-1", schema: {}, user_id: "u1", workspace_id: "w1", execution_mode: "autonomous", program_type: "workflow" },
      error: null,
    }));
    resolvers.set("runs:insert", () => ({ data: { id: "run-2" }, error: null }));
    resolvers.set("program_connections:select", () => ({ data: [], error: null }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));

    const result = await sweepDueCronTriggers(silentLogger);
    expect(result.fired).toBe(1);
    vi.unstubAllGlobals();
  });
});
