import { describe, expect, it } from "vitest";
import { agentToolGate } from "../agents/tool-execution";

describe("agentToolGate", () => {
  it("rejects unknown tools", () => {
    const r = agentToolGate({ toolScope: "unknown", destructive: false, dryRun: false, targetWorkspaceAllowed: true });
    expect(r.allow).toBe(false);
  });

  it("always allows read tools (scope handled by the queries)", () => {
    expect(agentToolGate({ toolScope: "read", destructive: false, dryRun: false, targetWorkspaceAllowed: false }).allow).toBe(true);
    // Even in dry-run, reads are fine.
    expect(agentToolGate({ toolScope: "read", destructive: false, dryRun: true, targetWorkspaceAllowed: false }).allow).toBe(true);
  });

  it("simulates write tools in dry-run regardless of permission", () => {
    const r = agentToolGate({ toolScope: "write", destructive: true, dryRun: true, targetWorkspaceAllowed: true });
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.simulated).toBe(true);
  });

  it("blocks write tools when the target workspace is not permitted", () => {
    const r = agentToolGate({ toolScope: "write", destructive: false, dryRun: false, targetWorkspaceAllowed: false });
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.simulated).toBeUndefined();
  });

  it("allows write tools only when not dry-run AND the target workspace is permitted", () => {
    expect(agentToolGate({ toolScope: "write", destructive: false, dryRun: false, targetWorkspaceAllowed: true }).allow).toBe(true);
    expect(agentToolGate({ toolScope: "write", destructive: true, dryRun: false, targetWorkspaceAllowed: true }).allow).toBe(true);
  });
});
