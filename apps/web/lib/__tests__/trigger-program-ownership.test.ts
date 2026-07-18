import { beforeEach, describe, expect, it, vi } from "vitest";

// Covers the cross-tenant gap: a "program" trigger's source_program_id must
// belong to a program the acting user can access, both on create and on
// update — otherwise anyone can wire a trigger to fire off any program's
// completion in the whole database by guessing/observing its UUID.

type DbResult = { data: unknown; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(async () => ({ id: "user-1" })),
  getProgramAccess: vi.fn(async (programId: string) => {
    if (programId === "own-program") return { effective: "editor" };
    if (programId === "accessible-source") return { effective: "viewer" };
    if (programId === "inaccessible-source") return null;
    return null;
  }),
  checkTriggerAccess: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@/lib/api", () => ({
  getAuthUser: mocks.getAuthUser,
  createServiceClient: () => new FakeDb(),
  apiError: (message: string, status: number, code?: string) =>
    Response.json({ error: message, ...(code ? { code } : {}) }, { status }),
}));
vi.mock("@/lib/workspaces", () => ({
  getProgramAccess: mocks.getProgramAccess,
  canView: (access: unknown) => Boolean((access as { effective?: unknown } | null)?.effective),
  canEdit: (access: unknown) => (access as { effective?: unknown } | null)?.effective === "editor",
}));
vi.mock("@/lib/limits", () => ({ checkTriggerAccess: mocks.checkTriggerAccess }));
vi.mock("@/lib/webhook-trigger-auth", () => ({
  enrichWebhookTriggerForClient: (trigger: unknown) => trigger,
  rotateWebhookToken: () => "rotated",
}));
vi.mock("@/lib/cron-expression", () => ({ nextFiveFieldCronRun: () => null }));
vi.mock("@/lib/server-log", () => ({ serverLog: vi.fn() }));
vi.mock("@/lib/triggers/schema-trigger-state", () => ({
  schemaTriggerNodeId: () => null,
  withSchemaTriggerActiveState: () => null,
}));

class FakeDb {
  from(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is"]) {
      chain[method] = () => chain;
    }
    chain.insert = () => chain;
    chain.update = () => chain;
    const resolve = (): DbResult => {
      if (table === "triggers") {
        return { data: { id: "trigger-1", program_id: "own-program", type: "program", config: {}, is_active: true, created_at: "now" }, error: null };
      }
      return { data: null, error: { message: "no resolver" } };
    };
    chain.single = () => Promise.resolve(resolve());
    chain.maybeSingle = () => Promise.resolve(resolve());
    return chain;
  }
}

import { POST } from "@/app/api/programs/[id]/triggers/route";
import { PATCH } from "@/app/api/programs/[id]/triggers/[triggerId]/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthUser.mockResolvedValue({ id: "user-1" });
  mocks.checkTriggerAccess.mockResolvedValue({ allowed: true });
});

describe("POST /api/programs/[id]/triggers — program trigger ownership", () => {
  it("rejects a source_program_id the user cannot access", async () => {
    const res = await POST(
      new Request("http://localhost/api/programs/own-program/triggers", {
        method: "POST",
        body: JSON.stringify({ type: "program", config: { source_program_id: "inaccessible-source" } }),
      }),
      { params: Promise.resolve({ id: "own-program" }) }
    );
    expect(res.status).toBe(403);
  });

  it("allows a source_program_id the user can view", async () => {
    const res = await POST(
      new Request("http://localhost/api/programs/own-program/triggers", {
        method: "POST",
        body: JSON.stringify({ type: "program", config: { source_program_id: "accessible-source" } }),
      }),
      { params: Promise.resolve({ id: "own-program" }) }
    );
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/programs/[id]/triggers/[triggerId] — program trigger ownership", () => {
  it("rejects rewriting source_program_id to a program the user cannot access", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/programs/own-program/triggers/trigger-1", {
        method: "PATCH",
        body: JSON.stringify({ config: { source_program_id: "inaccessible-source" } }),
      }),
      { params: Promise.resolve({ id: "own-program", triggerId: "trigger-1" }) }
    );
    expect(res.status).toBe(403);
  });
});
