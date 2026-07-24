import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";

const CreateTeamSchema = z.object({
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

type MemberRow = {
  team_id: string;
  user_id: string;
  role: string;
  invited_at: string;
};

/**
 * GET /api/teams — List the teams the current user belongs to (as owner or member).
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;

  // Teams the user is a member of, plus teams they own (owners are implicit admins).
  const [{ data: memberships, error: membershipError }, { data: owned, error: ownedError }] =
    await Promise.all([
      service.from("team_members").select("team_id, role").eq("user_id", user.id),
      service.from("teams").select("id").eq("owner_id", user.id),
    ]);

  if (membershipError) return apiError(membershipError.message, 500);
  if (ownedError) return apiError(ownedError.message, 500);

  const roleByTeam = new Map<string, string>();
  for (const row of (memberships ?? []) as Array<{ team_id: string; role: string }>) {
    roleByTeam.set(row.team_id, row.role);
  }
  // Owner always outranks any stored membership role.
  for (const row of (owned ?? []) as Array<{ id: string }>) {
    roleByTeam.set(row.id, "admin");
  }

  const teamIds = [...roleByTeam.keys()];
  if (teamIds.length === 0) {
    return NextResponse.json({ teams: [] });
  }

  const { data: teams, error: teamError } = await service
    .from("teams")
    .select("id, name, owner_id, created_at")
    .in("id", teamIds)
    .order("created_at", { ascending: true });

  if (teamError) return apiError(teamError.message, 500);

  // Member counts per team.
  const { data: counts } = await service
    .from("team_members")
    .select("team_id")
    .in("team_id", teamIds);

  const memberCounts = new Map<string, number>();
  for (const row of (counts ?? []) as Array<{ team_id: string }>) {
    memberCounts.set(row.team_id, (memberCounts.get(row.team_id) ?? 0) + 1);
  }

  return NextResponse.json({
    teams: ((teams ?? []) as TeamRow[]).map((team) => ({
      ...team,
      role: roleByTeam.get(team.id) ?? "member",
      is_owner: team.owner_id === user.id,
      member_count: memberCounts.get(team.id) ?? 0,
    })),
  });
}

/**
 * POST /api/teams — Create a team. The creator becomes the owner and is added
 * to team_members as an admin so roster queries include them.
 */
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const parsed = CreateTeamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;

  const { data: team, error: teamError } = await service
    .from("teams")
    .insert({ name: parsed.data.name, owner_id: user.id } as never)
    .select("id, name, owner_id, created_at")
    .single();

  if (teamError || !team) {
    return apiError(teamError?.message ?? "Team could not be created.", 500);
  }

  const { error: memberError } = await service
    .from("team_members")
    .insert({ team_id: (team as TeamRow).id, user_id: user.id, role: "admin" } as never);

  if (memberError) {
    // Roll back the orphaned team so we don't leave a team with no roster.
    await service.from("teams").delete().eq("id", (team as TeamRow).id);
    return apiError(memberError.message, 500);
  }

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Team",
    event: "team.created",
    status: "completed",
    message: "User created a team.",
    details: { team_id: (team as TeamRow).id, name: parsed.data.name },
  });

  return NextResponse.json(
    { team: { ...(team as TeamRow), role: "admin", is_owner: true, member_count: 1 } },
    { status: 201 }
  );
}
