import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";
import { getTeamMembers, getTeamRole } from "@/lib/auth/team-context";

const InviteMemberSchema = z.object({
  email: z
    .string()
    .email()
    .transform((e) => e.trim().toLowerCase()),
  role: z.enum(["admin", "member", "viewer"]),
});

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

/**
 * GET /api/teams/[id]/members — List team members (requires membership).
 */
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const role = await getTeamRole(params.id, user.id);
  if (!role) return apiError("Team not found.", 404);

  return NextResponse.json({
    actor_role: role,
    members: await getTeamMembers(params.id),
  });
}

/**
 * POST /api/teams/[id]/members — Invite an existing user to the team by email.
 *
 * team_members references auth.users, so an invitee must already have a Corelyx
 * account. When no account matches the email we return 404 rather than creating
 * a dangling invite (this table has no token-based pending-invite flow).
 */
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const role = await getTeamRole(params.id, user.id);
  if (!role) return apiError("Team not found.", 404);
  if (role !== "admin") return apiError("Only team admins can invite members.", 403);

  const parsed = InviteMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;

  // Resolve the email to an existing account.
  const { data: authList } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  const targetUser = authList.users.find(
    (u: { email?: string | null }) => u.email?.trim().toLowerCase() === parsed.data.email
  );

  if (!targetUser) {
    return apiError("No Corelyx account was found for that email.", 404);
  }

  // Already a member?
  const existingRole = await getTeamRole(params.id, targetUser.id);
  if (existingRole) {
    return apiError("This user is already a member of the team.", 409);
  }

  const { data: member, error } = await service
    .from("team_members")
    .insert({ team_id: params.id, user_id: targetUser.id, role: parsed.data.role } as never)
    .select("team_id, user_id, role, invited_at")
    .single();

  if (error || !member) {
    return apiError(error?.message ?? "Member could not be added.", 500);
  }

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Team",
    event: "team.member.invited",
    status: "completed",
    message: "User added a member to a team.",
    details: { team_id: params.id, target_user_id: targetUser.id, role: parsed.data.role },
  });

  return NextResponse.json({ member }, { status: 201 });
}

/**
 * DELETE /api/teams/[id]/members?user_id=<uuid> — Remove a member.
 * Members may remove themselves (leave); admins may remove anyone else.
 * The team owner can never be removed.
 */
export async function DELETE(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const actorRole = await getTeamRole(params.id, user.id);
  if (!actorRole) return apiError("Team not found.", 404);

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("user_id");
  if (!targetUserId) return apiError("Missing user_id.", 400);

  const isSelf = targetUserId === user.id;
  if (!isSelf && actorRole !== "admin") {
    return apiError("Only team admins can remove other members.", 403);
  }

  const service = createServiceClient() as LooseServiceClient;
  const { data: team } = await service
    .from("teams")
    .select("owner_id")
    .eq("id", params.id)
    .maybeSingle();

  if (team && (team as { owner_id: string }).owner_id === targetUserId) {
    return apiError("The team owner cannot be removed.", 403);
  }

  const { error } = await service
    .from("team_members")
    .delete()
    .eq("team_id", params.id)
    .eq("user_id", targetUserId);

  if (error) return apiError(error.message, 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "warning",
    source: "Team",
    event: isSelf ? "team.member.left" : "team.member.removed",
    status: "completed",
    message: isSelf ? "User left a team." : "User removed a member from a team.",
    details: { team_id: params.id, target_user_id: targetUserId },
  });

  return NextResponse.json({ removed: true });
}
