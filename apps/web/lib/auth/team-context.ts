import "server-only";
import { cookies } from "next/headers";
import { createServiceClient, type LooseServiceClient } from "@/lib/api";

/**
 * Team roles, most privileged first. The team owner is always treated as an
 * admin regardless of any stored team_members row.
 */
export type TeamRole = "admin" | "member" | "viewer";

/** Cookie the TeamSwitcher writes so the active team survives navigation. */
export const ACTIVE_TEAM_COOKIE = "corelyx_active_team";

export type TeamContext = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  /** Effective role of the current user in this team. */
  role: TeamRole;
  is_owner: boolean;
};

export type TeamMember = {
  team_id: string;
  user_id: string;
  role: TeamRole;
  invited_at: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * Resolve the effective role of `userId` in `teamId`. Returns null when the user
 * is neither the owner nor a member. Owners always resolve to "admin".
 */
export async function getTeamRole(
  teamId: string,
  userId: string
): Promise<TeamRole | null> {
  const service = createServiceClient() as LooseServiceClient;

  const { data: team } = await service
    .from("teams")
    .select("owner_id")
    .eq("id", teamId)
    .maybeSingle();

  if (team && (team as { owner_id: string }).owner_id === userId) return "admin";

  const { data: membership } = await service
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  return (membership as { role: TeamRole } | null)?.role ?? null;
}

/** True when the user is an admin (or owner) of the team. */
export async function isTeamAdmin(teamId: string, userId: string): Promise<boolean> {
  return (await getTeamRole(teamId, userId)) === "admin";
}

/**
 * The user's active team. Prefers the team pinned in the ACTIVE_TEAM_COOKIE,
 * falling back to the earliest-created team they belong to. Returns null when
 * the user has no teams.
 */
export async function getCurrentTeam(userId: string): Promise<TeamContext | null> {
  const service = createServiceClient() as LooseServiceClient;

  const [{ data: memberships }, { data: owned }] = await Promise.all([
    service.from("team_members").select("team_id, role").eq("user_id", userId),
    service.from("teams").select("id").eq("owner_id", userId),
  ]);

  const roleByTeam = new Map<string, TeamRole>();
  for (const row of (memberships ?? []) as Array<{ team_id: string; role: TeamRole }>) {
    roleByTeam.set(row.team_id, row.role);
  }
  for (const row of (owned ?? []) as Array<{ id: string }>) {
    roleByTeam.set(row.id, "admin");
  }

  const teamIds = [...roleByTeam.keys()];
  if (teamIds.length === 0) return null;

  const cookieStore = await cookies();
  const pinned = cookieStore.get(ACTIVE_TEAM_COOKIE)?.value;
  const preferredId = pinned && roleByTeam.has(pinned) ? pinned : null;

  const { data: teams } = await service
    .from("teams")
    .select("id, name, owner_id, created_at")
    .in("id", teamIds)
    .order("created_at", { ascending: true });

  const rows = (teams ?? []) as Array<Omit<TeamContext, "role" | "is_owner">>;
  if (rows.length === 0) return null;

  const chosen = (preferredId && rows.find((t) => t.id === preferredId)) || rows[0];

  return {
    ...chosen,
    role: roleByTeam.get(chosen.id) ?? "member",
    is_owner: chosen.owner_id === userId,
  };
}

/**
 * Full roster for a team, hydrated with email/display_name/avatar. Callers must
 * confirm the requester belongs to the team before exposing this.
 */
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const service = createServiceClient() as LooseServiceClient;

  const { data: members } = await service
    .from("team_members")
    .select("team_id, user_id, role, invited_at")
    .eq("team_id", teamId)
    .order("invited_at", { ascending: true });

  const rows = (members ?? []) as Array<Omit<TeamMember, "email" | "display_name" | "avatar_url">>;
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: profiles } = await service
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds);

  const profileById = new Map(
    ((profiles ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>)
      .map((p) => [p.id, p])
  );

  const emailById = new Map<string, string | null>();
  await Promise.all(
    userIds.map(async (userId) => {
      const { data } = await service.auth.admin.getUserById(userId);
      emailById.set(userId, data.user?.email ?? null);
    })
  );

  return rows.map((row) => {
    const profile = profileById.get(row.user_id);
    return {
      ...row,
      email: emailById.get(row.user_id) ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}
