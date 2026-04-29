import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import {
  PROGRAM_ROLES,
  PROGRAM_VISIBILITIES,
  canEdit,
  canView,
  getProgramAccess,
  type ProgramRole,
  type ProgramVisibility,
  type WorkspaceRole,
} from "@/lib/workspaces";

const UpdateShareSchema = z.object({
  visibility: z.enum(PROGRAM_VISIBILITIES).optional(),
  user_id: z.string().uuid().optional(),
  role: z.enum(PROGRAM_ROLES).nullable().optional(),
});

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type WorkspaceMemberRow = {
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
};

type ProgramMemberRow = {
  user_id: string;
  role: ProgramRole;
};

export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const service = createServiceClient() as LooseServiceClient;
  const [{ data: program }, { data: workspaceMembers }, { data: programMembers }] = await Promise.all([
    service
      .from("programs")
      .select("id, visibility, workspace_id")
      .eq("id", params.id)
      .single(),
    service
      .from("workspace_memberships")
      .select("user_id, role, created_at")
      .eq("workspace_id", access!.workspaceId)
      .order("created_at", { ascending: true }),
    service
      .from("program_memberships")
      .select("user_id, role")
      .eq("program_id", params.id),
  ]);

  const members = (workspaceMembers ?? []) as WorkspaceMemberRow[];
  const userIds = members.map((member) => member.user_id);
  const { data: profiles } = userIds.length > 0
    ? await service
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds)
    : { data: [] };

  const { data: authUsers } = userIds.length > 0
    ? await service.auth.admin.listUsers()
    : { data: { users: [] } };

  const profileById = new Map(
    ((profiles ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>)
      .map((profile) => [profile.id, profile])
  );
  const emailById = new Map(
    (authUsers.users ?? []).map((authUser) => [authUser.id, authUser.email ?? null])
  );
  const programRoleByUser = new Map(
    ((programMembers ?? []) as ProgramMemberRow[]).map((member) => [member.user_id, member.role])
  );

  return NextResponse.json({
    visibility: ((program as { visibility?: ProgramVisibility } | null)?.visibility ?? "workspace") as ProgramVisibility,
    can_edit: canEdit(access),
    members: members.map((member) => ({
      user_id: member.user_id,
      workspace_role: member.role,
      program_role: programRoleByUser.get(member.user_id) ?? null,
      display_name: profileById.get(member.user_id)?.display_name ?? null,
      avatar_url: profileById.get(member.user_id)?.avatar_url ?? null,
      email: emailById.get(member.user_id) ?? null,
    })),
  });
}

export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("Only program editors can change sharing.", 403);

  const parsed = UpdateShareSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;

  if (parsed.data.visibility) {
    const { error } = await service
      .from("programs")
      .update({ visibility: parsed.data.visibility, updated_at: new Date().toISOString() } as never)
      .eq("id", params.id);
    if (error) return apiError(error.message, 500);
  }

  if (parsed.data.user_id) {
    const { data: workspaceMember } = await service
      .from("workspace_memberships")
      .select("user_id")
      .eq("workspace_id", access!.workspaceId)
      .eq("user_id", parsed.data.user_id)
      .maybeSingle();
    if (!workspaceMember) return apiError("User is not a member of this workspace.", 400);

    if (parsed.data.role === null) {
      const { error } = await service
        .from("program_memberships")
        .delete()
        .eq("program_id", params.id)
        .eq("user_id", parsed.data.user_id);
      if (error) return apiError(error.message, 500);
    } else if (parsed.data.role) {
      const { error } = await service
        .from("program_memberships")
        .upsert({
          program_id: params.id,
          user_id: parsed.data.user_id,
          role: parsed.data.role,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        } as never, { onConflict: "program_id,user_id" });
      if (error) return apiError(error.message, 500);
    }
  }

  return NextResponse.json({ ok: true });
}
