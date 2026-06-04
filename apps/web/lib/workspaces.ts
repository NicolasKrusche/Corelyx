import { createServiceClient } from "@/lib/api";
export {
  AGENT_MIN_ROLE_LABELS,
  AGENT_MIN_ROLES,
  INVITABLE_WORKSPACE_ROLES,
  PROGRAM_ROLE_LABELS,
  PROGRAM_ROLES,
  PROGRAM_VISIBILITIES,
  WORKSPACE_ROLE_LABELS,
  WORKSPACE_ROLES,
  agentRunAllowedForRole,
  canAssignWorkspaceRole,
  canContributeToWorkspace,
  canManageWorkspace,
  normalizeWorkspaceEmail,
  type AgentMinRole,
  type AgentWorkspaceSettings,
  type InvitableWorkspaceRole,
  type ProgramRole,
  type ProgramVisibility,
  type WorkspaceRole,
} from "@/lib/workspace-types";
import {
  agentRunAllowedForRole,
  type AgentMinRole,
  type ProgramRole,
  type ProgramVisibility,
  type WorkspaceRole,
} from "@/lib/workspace-types";

// ─── Active workspace resolution ─────────────────────────────────────────────

type LooseClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

/**
 * Resolve the currently-active workspace for a user.
 * Reads `profiles.org_id`; falls back to the earliest membership when stale.
 * Returns the workspace id and the user's role within it.
 */
export async function getActiveWorkspace(
  userId: string
): Promise<{ workspaceId: string; role: WorkspaceRole } | null> {
  const service = createServiceClient() as LooseClient;

  const { data: profile } = await service
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  const candidate = (profile as { org_id?: string | null } | null)?.org_id ?? null;

  if (candidate) {
    const { data } = await service
      .from("workspace_memberships")
      .select("role")
      .eq("workspace_id", candidate)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      return { workspaceId: candidate, role: (data as { role: WorkspaceRole }).role };
    }
  }

  // Fallback: earliest membership.
  const { data: fallback } = await service
    .from("workspace_memberships")
    .select("workspace_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!fallback) return null;
  const row = fallback as { workspace_id: string; role: WorkspaceRole };

  // Heal the stale pointer for next time.
  await service.from("profiles").update({ org_id: row.workspace_id } as never).eq("id", userId);

  return { workspaceId: row.workspace_id, role: row.role };
}

export async function getWorkspaceRole(
  workspaceId: string,
  userId: string
): Promise<WorkspaceRole | null> {
  const service = createServiceClient() as LooseClient;
  const { data } = await service
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role: WorkspaceRole } | null)?.role ?? null;
}

// ─── Per-program access ──────────────────────────────────────────────────────

export type EffectiveProgramAccess = {
  programId: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  programRole: ProgramRole | null;
  effective: ProgramRole | null;
};

/**
 * Mirror of the `program_access_role` SQL function in TypeScript so route
 * handlers using the service-role client (which bypasses RLS) still enforce
 * access correctly.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getProgramAccess(
  programId: string,
  userId: string
): Promise<EffectiveProgramAccess | null> {
  if (!UUID_RE.test(programId)) return null;

  const service = createServiceClient() as LooseClient;

  const { data: program } = await service
    .from("programs")
    .select("id, workspace_id, visibility")
    .eq("id", programId)
    .maybeSingle();
  if (!program) return null;
  const p = program as { id: string; workspace_id: string; visibility: ProgramVisibility };

  const workspaceRole = await getWorkspaceRole(p.workspace_id, userId);
  if (!workspaceRole) return null;

  if (workspaceRole === "owner" || workspaceRole === "admin") {
    return {
      programId: p.id,
      workspaceId: p.workspace_id,
      workspaceRole,
      programRole: null,
      effective: "editor",
    };
  }

  const { data: override } = await service
    .from("program_memberships")
    .select("role")
    .eq("program_id", programId)
    .eq("user_id", userId)
    .maybeSingle();
  const programRole = (override as { role: ProgramRole } | null)?.role ?? null;
  if (programRole) {
    return {
      programId: p.id,
      workspaceId: p.workspace_id,
      workspaceRole,
      programRole,
      effective: programRole,
    };
  }

  if (p.visibility === "restricted") {
    return {
      programId: p.id,
      workspaceId: p.workspace_id,
      workspaceRole,
      programRole: null,
      effective: null,
    };
  }

  const fallback: ProgramRole | null =
    workspaceRole === "member" ? "runner" : workspaceRole === "viewer" ? "viewer" : null;
  return {
    programId: p.id,
    workspaceId: p.workspace_id,
    workspaceRole,
    programRole: null,
    effective: fallback,
  };
}

// ─── Agent execution permission ──────────────────────────────────────────────

/**
 * May this user run an agent that acts on the given workspace?
 *
 * The owner is always allowed. Other members are allowed only when the owner
 * has enabled external agents and the member meets the configured minimum role.
 * Mirrors `agentRunAllowedForRole`, loading the workspace settings first.
 */
export async function canRunAgentInWorkspace(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const role = await getWorkspaceRole(workspaceId, userId);
  if (!role) return false;
  if (role === "owner") return true;

  const service = createServiceClient() as LooseClient;
  const { data } = await service
    .from("workspaces")
    .select("allow_external_agents, agent_min_role")
    .eq("id", workspaceId)
    .maybeSingle();
  const settings = data as
    | { allow_external_agents: boolean | null; agent_min_role: AgentMinRole | null }
    | null;

  return agentRunAllowedForRole(role, {
    allowExternalAgents: settings?.allow_external_agents ?? false,
    minRole: settings?.agent_min_role ?? "admin",
  });
}

export function canEdit(access: EffectiveProgramAccess | null): boolean {
  return access?.effective === "editor";
}
export function canRun(access: EffectiveProgramAccess | null): boolean {
  return access?.effective === "editor" || access?.effective === "runner";
}
export function canView(access: EffectiveProgramAccess | null): boolean {
  return Boolean(access?.effective);
}
