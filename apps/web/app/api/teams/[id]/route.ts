import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";
import { getTeamRole } from "@/lib/auth/team-context";

const UpdateTeamSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type TeamRow = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
};

/**
 * GET /api/teams/[id] — Team details (requires membership).
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

  const service = createServiceClient() as LooseServiceClient;
  const { data: team, error } = await service
    .from("teams")
    .select("id, name, owner_id, created_at")
    .eq("id", params.id)
    .single();

  if (error || !team) return apiError("Team not found.", 404);

  const { count } = await service
    .from("team_members")
    .select("user_id", { count: "exact", head: true })
    .eq("team_id", params.id);

  return NextResponse.json({
    team: {
      ...(team as TeamRow),
      role,
      is_owner: (team as TeamRow).owner_id === user.id,
      member_count: count ?? 0,
    },
  });
}

/**
 * PATCH /api/teams/[id] — Rename the team (admins only).
 */
export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const role = await getTeamRole(params.id, user.id);
  if (!role) return apiError("Team not found.", 404);
  if (role !== "admin") return apiError("Only team admins can update the team.", 403);

  const parsed = UpdateTeamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;
  const { data: team, error } = await service
    .from("teams")
    .update({ name: parsed.data.name } as never)
    .eq("id", params.id)
    .select("id, name, owner_id, created_at")
    .single();

  if (error || !team) return apiError(error?.message ?? "Team not found.", 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Team",
    event: "team.updated",
    status: "completed",
    message: "User renamed a team.",
    details: { team_id: params.id, name: parsed.data.name },
  });

  return NextResponse.json({ team: team as TeamRow });
}

/**
 * DELETE /api/teams/[id] — Delete the team (owner only). Cascades to
 * team_members and program_shares via FK constraints.
 */
export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const { data: team } = await service
    .from("teams")
    .select("id, owner_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!team) return apiError("Team not found.", 404);
  if ((team as { owner_id: string }).owner_id !== user.id) {
    return apiError("Only the team owner can delete the team.", 403);
  }

  const { error } = await service.from("teams").delete().eq("id", params.id);
  if (error) return apiError(error.message, 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "warning",
    source: "Team",
    event: "team.deleted",
    status: "completed",
    message: "User deleted a team.",
    details: { team_id: params.id },
  });

  return NextResponse.json({ deleted: true });
}
