import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser, type LooseServiceClient } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";
import { getTeamRole } from "@/lib/auth/team-context";

const UpdateRoleSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

/**
 * PATCH /api/teams/[id]/members/[userId] — Change a member's role (admins only).
 * The owner's role is fixed at admin and cannot be downgraded.
 */
export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string; userId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const actorRole = await getTeamRole(params.id, user.id);
  if (!actorRole) return apiError("Team not found.", 404);
  if (actorRole !== "admin") return apiError("Only team admins can change roles.", 403);

  const parsed = UpdateRoleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;
  const { data: team } = await service
    .from("teams")
    .select("owner_id")
    .eq("id", params.id)
    .maybeSingle();

  if (team && (team as { owner_id: string }).owner_id === params.userId) {
    return apiError("The team owner's role cannot be changed.", 403);
  }

  const targetRole = await getTeamRole(params.id, params.userId);
  if (!targetRole) return apiError("Member not found.", 404);

  const { data: member, error } = await service
    .from("team_members")
    .update({ role: parsed.data.role } as never)
    .eq("team_id", params.id)
    .eq("user_id", params.userId)
    .select("team_id, user_id, role, invited_at")
    .single();

  if (error || !member) return apiError(error?.message ?? "Member not found.", 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Team",
    event: "team.member.role_updated",
    status: "completed",
    message: "User changed a team member role.",
    details: { team_id: params.id, target_user_id: params.userId, role: parsed.data.role },
  });

  return NextResponse.json({ member });
}

/**
 * DELETE /api/teams/[id]/members/[userId] — Remove a member.
 * Members may remove themselves (leave); admins may remove anyone except the owner.
 */
export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string; userId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const actorRole = await getTeamRole(params.id, user.id);
  if (!actorRole) return apiError("Team not found.", 404);

  const isSelf = params.userId === user.id;
  if (!isSelf && actorRole !== "admin") {
    return apiError("Only team admins can remove other members.", 403);
  }

  const service = createServiceClient() as LooseServiceClient;
  const { data: team } = await service
    .from("teams")
    .select("owner_id")
    .eq("id", params.id)
    .maybeSingle();

  if (team && (team as { owner_id: string }).owner_id === params.userId) {
    return apiError("The team owner cannot be removed.", 403);
  }

  const { error } = await service
    .from("team_members")
    .delete()
    .eq("team_id", params.id)
    .eq("user_id", params.userId);

  if (error) return apiError(error.message, 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "warning",
    source: "Team",
    event: isSelf ? "team.member.left" : "team.member.removed",
    status: "completed",
    message: isSelf ? "User left a team." : "User removed a member from a team.",
    details: { team_id: params.id, target_user_id: params.userId },
  });

  return NextResponse.json({ removed: true });
}
