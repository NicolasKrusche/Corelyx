export const WORKSPACE_ROLES = ["owner", "admin", "member", "viewer"] as const;
export const INVITABLE_WORKSPACE_ROLES = ["admin", "member", "viewer"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type InvitableWorkspaceRole = (typeof INVITABLE_WORKSPACE_ROLES)[number];

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function canManageWorkspace(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin";
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
