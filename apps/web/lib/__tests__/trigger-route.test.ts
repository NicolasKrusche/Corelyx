import { beforeEach, describe, expect, it, vi } from "vitest";

type DbResult = { data: unknown; error: { message: string } | null };
type Resolver = (payload: unknown) => DbResult;

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(async () => ({ id: "user-1" })),
  getProgramAccess: vi.fn(async () => ({ workspaceId: "workspace-1", role: "owner" })),
  createServiceClient: vi.fn(),
  serverLog: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getAuthUser: mocks.getAuthUser,
  createServiceClient: mocks.createServiceClient,
  apiError: (message: string, status: number, code?: string) =>
    Response.json({ error: message, ...(code ? { code } : {}) }, { status }),
}));
vi.mock("@/lib/workspaces", () => ({
  getProgramAccess: mocks.getProgramAccess,
  canView: () => true,
  canEdit: () => true,
}));
vi.mock("@/lib/webhook-trigger-auth", () => ({
  enrichWebhookTriggerForClient: (trigger: unknown) => trigger,
  rotateWebhookToken: () => "rotated",
}));
vi.mock("@/lib/server-log", () => ({ serverLog: mocks.serverLog }));

import { DELETE, PATCH } from "@/app/api/programs/[id]/triggers/[triggerId]/route";

class FakeDb {
  readonly resolvers = new Map<string, Resolver>();
  readonly writes: Array<{ table: string; operation: string; payload: unknown }> = [];

  from = (table: string) => ({
    select: (...args: unknown[]) => this.query(table, "select", args),
    update: (payload: unknown) => {
      this.writes.push({ table, operation: "update", payload });
      return this.query(table, "update", payload);
    },
    insert: (payload: unknown) => {
      this.writes.push({ table, operation: "insert", payload });
      return this.query(table, "insert", payload);
    },
    delete: () => {
      this.writes.push({ table, operation: "delete", payload: null });
      return this.query(table, "delete", null);
    },
  });

  private query(table: string, operation: string, payload: unknown) {
    const resolve = () => this.resolvers.get(`${table}:${operation}`)?.(payload) ?? {
      data: null,
      error: { message: `No resolver for ${table}:${operation}` },
    };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is"]) {
      chain[method] = () => chain;
    }
    chain.single = () => Promise.resolve(resolve());
    chain.maybeSingle = () => Promise.resolve(resolve());
    chain.then = (onFulfilled: (value: DbResult) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled);
    return chain;
  }
}

const existingTrigger = {
  id: "trigger-row-1",
  type: "cron",
  is_active: true,
  config: {
    trigger_type: "cron",
    expression: "0 9 * * *",
    timezone: "UTC",
    node_id: "trigger-node-1",
  },
};

const workflowSchema = {
  nodes: [
    { id: "trigger-node-1", type: "trigger", config: { trigger_type: "cron", expression: "0 9 * * *", timezone: "UTC" } },
  ],
  triggers: [
    { node_id: "trigger-node-1", type: "cron", is_active: true, last_fired: null, next_scheduled: "future" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("schema-owned trigger route", () => {
  it("persists pause into the canonical schema before returning the DB row", async () => {
    const db = new FakeDb();
    db.resolvers.set("triggers:select", () => ({ data: existingTrigger, error: null }));
    db.resolvers.set("programs:select", () => ({
      data: { schema: workflowSchema, schema_version: 3 },
      error: null,
    }));
    db.resolvers.set("programs:update", () => ({ data: { id: "program-1" }, error: null }));
    db.resolvers.set("program_versions:insert", () => ({ data: null, error: null }));
    db.resolvers.set("triggers:update", (payload) => ({
      data: {
        ...existingTrigger,
        ...(payload as Record<string, unknown>),
        program_id: "program-1",
        webhook_token: null,
        last_fired_at: null,
        created_at: "2026-07-01T00:00:00.000Z",
      },
      error: null,
    }));
    mocks.createServiceClient.mockReturnValue(db);

    const response = await PATCH(
      new Request("http://localhost/api/programs/program-1/triggers/trigger-row-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: false }),
      }),
      { params: Promise.resolve({ id: "program-1", triggerId: "trigger-row-1" }) }
    );

    expect(response.status).toBe(200);
    const programWrite = db.writes.find((write) => write.table === "programs" && write.operation === "update");
    expect(programWrite?.payload).toMatchObject({ schema_version: 4 });
    expect((programWrite?.payload as { schema: typeof workflowSchema }).schema.triggers[0])
      .toMatchObject({ node_id: "trigger-node-1", is_active: false, next_scheduled: null });
    const triggerWrite = db.writes.find((write) => write.table === "triggers" && write.operation === "update");
    expect(triggerWrite?.payload).toMatchObject({ is_active: false, next_run_at: null });
  });

  it("resumes from the next future occurrence and stores that time in both projections", async () => {
    const db = new FakeDb();
    db.resolvers.set("triggers:select", () => ({
      data: { ...existingTrigger, is_active: false },
      error: null,
    }));
    db.resolvers.set("programs:select", () => ({
      data: {
        schema: {
          ...workflowSchema,
          triggers: [{ ...workflowSchema.triggers[0], is_active: false, next_scheduled: null }],
        },
        schema_version: 3,
      },
      error: null,
    }));
    db.resolvers.set("programs:update", () => ({ data: { id: "program-1" }, error: null }));
    db.resolvers.set("program_versions:insert", () => ({ data: null, error: null }));
    db.resolvers.set("triggers:update", (payload) => ({
      data: { ...existingTrigger, ...(payload as Record<string, unknown>) },
      error: null,
    }));
    mocks.createServiceClient.mockReturnValue(db);

    const response = await PATCH(
      new Request("http://localhost/api/programs/program-1/triggers/trigger-row-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      }),
      { params: Promise.resolve({ id: "program-1", triggerId: "trigger-row-1" }) }
    );

    expect(response.status).toBe(200);
    const triggerWrite = db.writes.find((write) => write.table === "triggers" && write.operation === "update");
    const nextRunAt = (triggerWrite?.payload as { next_run_at: string }).next_run_at;
    expect(new Date(nextRunAt).getTime()).toBeGreaterThan(Date.now());
    const programWrite = db.writes.find((write) => write.table === "programs" && write.operation === "update");
    expect((programWrite?.payload as { schema: typeof workflowSchema }).schema.triggers[0])
      .toMatchObject({ is_active: true, next_scheduled: nextRunAt });
  });

  it("rejects seconds-field cron expressions before updating either projection", async () => {
    const db = new FakeDb();
    db.resolvers.set("triggers:select", () => ({ data: existingTrigger, error: null }));
    mocks.createServiceClient.mockReturnValue(db);

    const response = await PATCH(
      new Request("http://localhost/api/programs/program-1/triggers/trigger-row-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { expression: "0 0 9 * * *", timezone: "UTC" },
        }),
      }),
      { params: Promise.resolve({ id: "program-1", triggerId: "trigger-row-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("five-field cron expression"),
    });
    expect(db.writes).toEqual([]);
  });

  it("rejects deletion of a schema-owned row with editor guidance", async () => {
    const db = new FakeDb();
    db.resolvers.set("triggers:select", () => ({ data: existingTrigger, error: null }));
    mocks.createServiceClient.mockReturnValue(db);

    const response = await DELETE(
      new Request("http://localhost/api/programs/program-1/triggers/trigger-row-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "program-1", triggerId: "trigger-row-1" }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Remove its trigger node in the editor"),
      code: "SCHEMA_TRIGGER_REMOVE_IN_EDITOR",
    });
    expect(db.writes.some((write) => write.operation === "delete")).toBe(false);
  });
});
