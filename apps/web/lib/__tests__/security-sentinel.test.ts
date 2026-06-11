import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/api", () => ({
  createServiceClient: () => ({ rpc: rpcMock, from: fromMock }),
}));
vi.mock("@/lib/server-log", () => ({
  serverLog: vi.fn(),
}));

import {
  evaluateSentinel,
  SENTINEL_RULES,
} from "@/lib/security/sentinel-rules";
import {
  credentialScopeId,
  invalidateLockCache,
  isSecurityLocked,
  recordSecurityEvent,
} from "@/lib/security/sentinel";

function selectChain(result: unknown) {
  const chain: any = {};
  for (const m of ["select", "eq", "limit", "order", "is", "insert"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  invalidateLockCache();
});

describe("evaluateSentinel", () => {
  it("takes no action for unknown events", () => {
    expect(evaluateSentinel("nonexistent.event", 999)).toEqual({
      alert: false,
      lock: false,
      rule: null,
    });
  });

  it("alerts exactly once at the alert threshold", () => {
    const rule = SENTINEL_RULES["webhook.signature_failed"];
    const at = rule.alertThreshold!;
    expect(evaluateSentinel("webhook.signature_failed", at - 1).alert).toBe(false);
    expect(evaluateSentinel("webhook.signature_failed", at).alert).toBe(true);
    expect(evaluateSentinel("webhook.signature_failed", at + 1).alert).toBe(false);
  });

  it("locks at and above the lock threshold, alerting at the crossing", () => {
    const rule = SENTINEL_RULES["webhook.signature_failed"];
    const at = rule.lockThreshold!;
    expect(evaluateSentinel("webhook.signature_failed", at - 1).lock).toBe(false);
    const crossing = evaluateSentinel("webhook.signature_failed", at);
    expect(crossing.lock).toBe(true);
    expect(crossing.alert).toBe(true);
    // Races past the threshold still lock (idempotent), without re-alerting.
    const past = evaluateSentinel("webhook.signature_failed", at + 3);
    expect(past.lock).toBe(true);
    expect(past.alert).toBe(false);
  });

  it("never locks for alert-only rules (internal auth failures)", () => {
    const rule = SENTINEL_RULES["internal.auth_failed"];
    expect(rule.lockThreshold).toBeUndefined();
    expect(evaluateSentinel("internal.auth_failed", 10_000).lock).toBe(false);
  });

  it("run.failed thresholds sit above normal failure rates", () => {
    const rule = SENTINEL_RULES["run.failed"];
    expect(rule.lockThreshold!).toBeGreaterThanOrEqual(10);
    expect(rule.lockTtlSeconds!).toBeGreaterThan(0);
  });
});

describe("credentialScopeId", () => {
  it("hashes deterministically and never echoes the input", () => {
    const id = credentialScopeId("super-secret-webhook-token");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain("super-secret");
    expect(credentialScopeId("super-secret-webhook-token")).toBe(id);
    expect(credentialScopeId("other-token")).not.toBe(id);
  });
});

describe("recordSecurityEvent", () => {
  it("records via RPC and takes no action below thresholds", async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });
    await recordSecurityEvent({
      event: "webhook.signature_failed",
      scopeType: "webhook_token",
      scopeId: "abc",
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      "record_security_event",
      expect.objectContaining({
        p_event: "webhook.signature_failed",
        p_scope_type: "webhook_token",
        p_scope_id: "abc",
        p_window_seconds: SENTINEL_RULES["webhook.signature_failed"].windowSeconds,
      })
    );
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("applies a scoped lock and alerts admins at the lock threshold", async () => {
    const lockThreshold = SENTINEL_RULES["webhook.signature_failed"].lockThreshold!;
    rpcMock.mockImplementation(async (fn: string) => {
      if (fn === "record_security_event") return { data: lockThreshold, error: null };
      return { data: null, error: null };
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "profiles") return selectChain({ data: [{ id: "admin-1" }], error: null });
      return selectChain({ data: null, error: null });
    });

    await recordSecurityEvent({
      event: "webhook.signature_failed",
      scopeType: "webhook_token",
      scopeId: "abc",
    });

    const rpcCalls = rpcMock.mock.calls.map((c) => c[0]);
    expect(rpcCalls).toContain("apply_security_lock");
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(fromMock).toHaveBeenCalledWith("notifications");
  });

  it("never throws when the database is unavailable", async () => {
    rpcMock.mockRejectedValue(new Error("db down"));
    await expect(
      recordSecurityEvent({
        event: "run.failed",
        scopeType: "program",
        scopeId: "p1",
      })
    ).resolves.toBeUndefined();
  });
});

describe("isSecurityLocked", () => {
  it("reflects the RPC answer and caches it briefly", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    expect(await isSecurityLocked("program", "p1")).toBe(true);
    expect(await isSecurityLocked("program", "p1")).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(1); // second hit served from cache
  });

  it("fails open when the lock check errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await isSecurityLocked("user", "u1")).toBe(false);
  });
});
