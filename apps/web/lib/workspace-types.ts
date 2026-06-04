export const WORKSPACE_ROLES = ["owner", "admin", "member", "viewer"] as const;
export const INVITABLE_WORKSPACE_ROLES = ["admin", "member", "viewer"] as const;
export const PROGRAM_ROLES = ["editor", "runner", "viewer"] as const;
export const PROGRAM_VISIBILITIES = ["workspace", "restricted"] as const;
// Minimum workspace role an owner can require for other members to run agents
// that act on the workspace. Owner is always allowed and so is not listed.
export const AGENT_MIN_ROLES = ["admin", "member", "viewer"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type InvitableWorkspaceRole = (typeof INVITABLE_WORKSPACE_ROLES)[number];
export type ProgramRole = (typeof PROGRAM_ROLES)[number];
export type ProgramVisibility = (typeof PROGRAM_VISIBILITIES)[number];
export type AgentMinRole = (typeof AGENT_MIN_ROLES)[number];

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const PROGRAM_ROLE_LABELS: Record<ProgramRole, string> = {
  editor: "Editor",
  runner: "Runner",
  viewer: "Viewer",
};

export const AGENT_MIN_ROLE_LABELS: Record<AgentMinRole, string> = {
  admin: "Admins only",
  member: "Members and above",
  viewer: "Any member (including viewers)",
};

// Higher rank = more privileged. Used only for agent-permission comparisons.
const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  viewer: 0,
};

const AGENT_MIN_ROLE_RANK: Record<AgentMinRole, number> = {
  admin: 2,
  member: 1,
  viewer: 0,
};

export type AgentWorkspaceSettings = {
  allowExternalAgents: boolean;
  minRole: AgentMinRole;
};

/**
 * Pure check: may a member with `role` run an agent that acts on a workspace
 * configured with `settings`?
 *
 * - The workspace owner is always allowed, regardless of settings.
 * - Otherwise the owner must have enabled external agents AND the member must
 *   meet the configured minimum role.
 *
 * This is the single source of truth for the rule; the server helper in
 * workspaces.ts just loads the settings and delegates here.
 */
export function agentRunAllowedForRole(
  role: WorkspaceRole | null | undefined,
  settings: AgentWorkspaceSettings
): boolean {
  if (!role) return false;
  if (role === "owner") return true;
  if (!settings.allowExternalAgents) return false;
  return WORKSPACE_ROLE_RANK[role] >= AGENT_MIN_ROLE_RANK[settings.minRole];
}

export function canManageWorkspace(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export function canContributeToWorkspace(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "member";
}

export function canAssignWorkspaceRole(
  actorRole: WorkspaceRole,
  nextRole: WorkspaceRole
) {
  if (nextRole === "owner") return actorRole === "owner";
  return canManageWorkspace(actorRole);
}

export function normalizeWorkspaceEmail(email: string) {
  return email.trim().toLowerCase();
}
