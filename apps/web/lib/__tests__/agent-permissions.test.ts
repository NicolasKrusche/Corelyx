import { describe, expect, it } from "vitest";
import {
  agentRunAllowedForRole,
  type AgentWorkspaceSettings,
  type WorkspaceRole,
} from "../workspace-types";

const ALLOW_VIEWER: AgentWorkspaceSettings = { allowExternalAgents: true, minRole: "viewer" };
const ALLOW_MEMBER: AgentWorkspaceSettings = { allowExternalAgents: true, minRole: "member" };
const ALLOW_ADMIN: AgentWorkspaceSettings = { allowExternalAgents: true, minRole: "admin" };
const DISABLED: AgentWorkspaceSettings = { allowExternalAgents: false, minRole: "viewer" };

describe("agentRunAllowedForRole", () => {
  it("always allows the workspace owner, even when external agents are disabled", () => {
    expect(agentRunAllowedForRole("owner", DISABLED)).toBe(true);
    expect(agentRunAllowedForRole("owner", ALLOW_ADMIN)).toBe(true);
  });

  it("denies everyone but the owner when external agents are disabled", () => {
    const roles: WorkspaceRole[] = ["admin", "member", "viewer"];
    for (const role of roles) {
      expect(agentRunAllowedForRole(role, DISABLED)).toBe(false);
    }
  });

  it("enforces the minimum role when external agents are enabled", () => {
    // minRole = admin → only admins (and owner) qualify
    expect(agentRunAllowedForRole("admin", ALLOW_ADMIN)).toBe(true);
    expect(agentRunAllowedForRole("member", ALLOW_ADMIN)).toBe(false);
    expect(agentRunAllowedForRole("viewer", ALLOW_ADMIN)).toBe(false);

    // minRole = member → admins and members qualify, viewers do not
    expect(agentRunAllowedForRole("admin", ALLOW_MEMBER)).toBe(true);
    expect(agentRunAllowedForRole("member", ALLOW_MEMBER)).toBe(true);
    expect(agentRunAllowedForRole("viewer", ALLOW_MEMBER)).toBe(false);

    // minRole = viewer → any member qualifies
    expect(agentRunAllowedForRole("admin", ALLOW_VIEWER)).toBe(true);
    expect(agentRunAllowedForRole("member", ALLOW_VIEWER)).toBe(true);
    expect(agentRunAllowedForRole("viewer", ALLOW_VIEWER)).toBe(true);
  });

  it("denies when the role is unknown / not a member", () => {
    expect(agentRunAllowedForRole(null, ALLOW_VIEWER)).toBe(false);
    expect(agentRunAllowedForRole(undefined, ALLOW_VIEWER)).toBe(false);
  });
});
