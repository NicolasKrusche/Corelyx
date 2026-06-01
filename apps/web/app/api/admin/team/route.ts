import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient } from "@/lib/api";
import { isAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";

const TEAM_ROLES = ["founder", "dev", "support", "marketing"] as const;
type TeamRole = (typeof TEAM_ROLES)[number];

export type TeamMember = {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  team_role: TeamRole | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  team_role: string | null;
  created_at: string;
};

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id, user.email))) return null;
  return user;
}

// GET /api/admin/team — list all team members with email + role.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return apiError("Forbidden", 403);

  const service = createServiceClient();

  const { data: profiles, error } = await service
    .from("profiles")
    .select("id, display_name, username, avatar_url, team_role, created_at")
    .eq("is_admin", true)
    .order("created_at", { ascending: true });

  if (error) return apiError(error.message, 500);

  // Fetch emails from auth for each team member
  const rows = (profiles ?? []) as unknown as ProfileRow[];
  const members: TeamMember[] = await Promise.all(
    rows.map(async (p) => {
      const { data } = await (service.auth.admin as unknown as {
        getUserById(id: string): Promise<{ data: { user: { email?: string } | null } }>;
      }).getUserById(p.id);
      return {
        id: p.id,
        email: data?.user?.email ?? "",
        display_name: p.display_name,
        username: p.username,
        avatar_url: p.avatar_url,
        team_role: (TEAM_ROLES.includes(p.team_role as TeamRole) ? p.team_role : null) as TeamRole | null,
        created_at: p.created_at,
      };
    })
  );

  return NextResponse.json({ members });
}

const PatchSchema = z.object({
  user_id: z.string().uuid(),
  team_role: z.enum(TEAM_ROLES).nullable(),
});

// PATCH /api/admin/team — update team_role for an existing team member.
export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return apiError("Forbidden", 403);

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ team_role: parsed.data.team_role } as never)
    .eq("id", parsed.data.user_id)
    .eq("is_admin", true);

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ ok: true });
}

const AddSchema = z.object({
  email: z.string().email(),
  team_role: z.enum(TEAM_ROLES).nullable().default(null),
});

// POST /api/admin/team — add a user to the team by email.
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return apiError("Forbidden", 403);

  const body = await request.json().catch(() => null);
  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient();

  // Look up the user by email
  const { data: authData, error: authError } = await (service.auth.admin as unknown as {
    listUsers(): Promise<{ data: { users: Array<{ id: string; email?: string }> } | null; error: unknown }>;
  }).listUsers();

  if (authError || !authData) return apiError("Could not look up users", 500);

  const found = authData.users.find(
    (u) => u.email?.toLowerCase() === parsed.data.email.toLowerCase()
  );
  if (!found) return apiError("No user found with that email", 404);
  if (found.id === admin.id) return apiError("You are already a team member", 400);

  const { error } = await service
    .from("profiles")
    .update({ is_admin: true, team_role: parsed.data.team_role } as never)
    .eq("id", found.id);

  if (error) return apiError(error.message, 500);

  // Return the new member
  const { data: profile } = await service
    .from("profiles")
    .select("id, display_name, username, avatar_url, team_role, created_at")
    .eq("id", found.id)
    .single();

  const p = profile as unknown as ProfileRow | null;
  const member: TeamMember = {
    id: found.id,
    email: found.email ?? "",
    display_name: p?.display_name ?? null,
    username: p?.username ?? null,
    avatar_url: p?.avatar_url ?? null,
    team_role: parsed.data.team_role,
    created_at: p?.created_at ?? new Date().toISOString(),
  };

  return NextResponse.json({ member }, { status: 201 });
}

const RemoveSchema = z.object({
  user_id: z.string().uuid(),
});

// DELETE /api/admin/team — remove a user from the team.
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return apiError("Forbidden", 403);

  const body = await request.json().catch(() => null);
  const parsed = RemoveSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  if (parsed.data.user_id === admin.id) return apiError("You cannot remove yourself", 400);

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ is_admin: false, team_role: null } as never)
    .eq("id", parsed.data.user_id);

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ ok: true });
}
