import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser, type LooseServiceClient } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";
import { checkTeamSeatLimit } from "@/lib/limits";
import {
  canAssignWorkspaceRole,
  canManageWorkspace,
  normalizeWorkspaceEmail,
  type WorkspaceRole,
} from "@/lib/workspaces";

const AddMemberSchema = z.object({
  email: z.string().email().transform(normalizeWorkspaceEmail),
  role: z.enum(["admin", "member", "viewer"]),
});

const UpdateMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

type MembershipRow = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type InvitationRow = {
  id: string;
  workspace_id: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  invited_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

async function getActorMembership(
  service: LooseServiceClient,
  workspaceId: string,
  userId: string
): Promise<MembershipRow | null> {
  const { data } = await service
    .from("workspace_memberships")
    .select("workspace_id, user_id, role, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data ?? null) as MembershipRow | null;
}

async function findAuthUserByEmail(
  service: LooseServiceClient,
  email: string
) {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);

    const match = data.users.find(
      (candidate: { email?: string | null }) =>
        candidate.email?.trim().toLowerCase() === email
    );
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function getOwnerCount(service: LooseServiceClient, workspaceId: string) {
  const { data } = await service
    .from("workspace_memberships")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("role", "owner");

  return (data ?? []).length;
}

async function hydrateMembers(
  service: LooseServiceClient,
  memberships: MembershipRow[]
) {
  const userIds = memberships.map((membership) => membership.user_id);
  const { data: profiles } = userIds.length > 0
    ? await service
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds)
    : { data: [] };

  const profileById = new Map(
    ((profiles ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>)
      .map((profile) => [profile.id, profile])
  );

  const emailById = new Map<string, string | null>();
  await Promise.all(
    userIds.map(async (userId) => {
      const { data } = await service.auth.admin.getUserById(userId);
      emailById.set(userId, data.user?.email ?? null);
    })
  );

  return memberships.map((membership) => {
    const profile = profileById.get(membership.user_id);
    return {
      ...membership,
      email: emailById.get(membership.user_id) ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}

export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const actor = await getActorMembership(service, params.id, user.id);
  if (!actor) return apiError("Workspace not found.", 404);

  const [membershipsRes, invitationsRes] = await Promise.all([
    service
      .from("workspace_memberships")
      .select("workspace_id, user_id, role, created_by, created_at, updated_at")
      .eq("workspace_id", params.id)
      .order("created_at", { ascending: true }),
    service
      .from("workspace_invitations")
      .select("id, workspace_id, email, role, invited_by, accepted_at, revoked_at, created_at, updated_at")
      .eq("workspace_id", params.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: true }),
  ]);

  if (membershipsRes.error) return apiError(membershipsRes.error.message, 500);
  if (invitationsRes.error) return apiError(invitationsRes.error.message, 500);

  const memberships = (membershipsRes.data ?? []) as MembershipRow[];

  return NextResponse.json({
    actor_role: actor.role,
    members: await hydrateMembers(service, memberships),
    invitations: (invitationsRes.data ?? []) as InvitationRow[],
  });
}

export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const actor = await getActorMembership(service, params.id, user.id);
  if (!actor) return apiError("Workspace not found.", 404);
  if (!canManageWorkspace(actor.role)) return apiError("Only owners and admins can add people.", 403);

  const parsed = AddMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const target = await findAuthUserByEmail(service, parsed.data.email);

  if (!target) {
    const seatCheck = await checkTeamSeatLimit(user.id, params.id);
    if (!seatCheck.allowed) {
      return apiError(seatCheck.upgradeMessage ?? seatCheck.reason ?? "Team seat limit reached.", 403);
    }

    const { data, error } = await service
      .from("workspace_invitations")
      .insert({
        workspace_id: params.id,
        email: parsed.data.email,
        role: parsed.data.role,
        invited_by: user.id,
      } as never)
      .select("id, workspace_id, email, role, invited_by, accepted_at, revoked_at, created_at, updated_at")
      .single();

    if (error || !data) return apiError(error?.message ?? "Invitation could not be created.", 500);

    await writeAppLog(service, {
      userId: user.id,
      level: "info",
      source: "Workspace",
      event: "workspace.invitation.created",
      status: "completed",
      message: "User invited someone to a workspace.",
      details: { workspace_id: params.id, role: parsed.data.role },
    });

    return NextResponse.json({ invitation: data as InvitationRow }, { status: 201 });
  }

  const existingMembership = await getActorMembership(service, params.id, target.id);
  if (!existingMembership) {
    const seatCheck = await checkTeamSeatLimit(user.id, params.id);
    if (!seatCheck.allowed) {
      return apiError(seatCheck.upgradeMessage ?? seatCheck.reason ?? "Team seat limit reached.", 403);
    }
  }

  await service
    .from("profiles")
    .upsert({ id: target.id } as never, { onConflict: "id" });

  const { data, error } = await service
    .from("workspace_memberships")
    .upsert({
      workspace_id: params.id,
      user_id: target.id,
      role: parsed.data.role,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "workspace_id,user_id" })
    .select("workspace_id, user_id, role, created_by, created_at, updated_at")
    .single();

  if (error || !data) return apiError(error?.message ?? "Member could not be added.", 500);

  await service
    .from("profiles")
    .update({ org_id: params.id } as never)
    .eq("id", target.id)
    .is("org_id", null);

  await service
    .from("workspace_invitations")
    .update({
      accepted_by: target.id,
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("workspace_id", params.id)
    .eq("email", parsed.data.email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Workspace",
    event: "workspace.member.added",
    status: "completed",
    message: "User added a member to a workspace.",
    details: { workspace_id: params.id, target_user_id: target.id, role: parsed.data.role },
  });

  const [member] = await hydrateMembers(service, [data as MembershipRow]);
  return NextResponse.json({ member }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const actor = await getActorMembership(service, params.id, user.id);
  if (!actor) return apiError("Workspace not found.", 404);
  if (!canManageWorkspace(actor.role)) return apiError("Only owners and admins can update roles.", 403);

  const parsed = UpdateMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);
  if (!canAssignWorkspaceRole(actor.role, parsed.data.role)) {
    return apiError("Only owners can assign the owner role.", 403);
  }

  const target = await getActorMembership(service, params.id, parsed.data.user_id);
  if (!target) return apiError("Member not found.", 404);
  if (target.role === "owner" && parsed.data.role !== "owner" && await getOwnerCount(service, params.id) <= 1) {
    return apiError("A workspace must have at least one owner.", 409);
  }
  if (target.role === "owner" && actor.role !== "owner") {
    return apiError("Admins cannot change owner roles.", 403);
  }

  const { data, error } = await service
    .from("workspace_memberships")
    .update({ role: parsed.data.role, updated_at: new Date().toISOString() } as never)
    .eq("workspace_id", params.id)
    .eq("user_id", parsed.data.user_id)
    .select("workspace_id, user_id, role, created_by, created_at, updated_at")
    .single();

  if (error || !data) return apiError(error?.message ?? "Member could not be updated.", 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Workspace",
    event: "workspace.member.role_updated",
    status: "completed",
    message: "User updated a workspace member role.",
    details: { workspace_id: params.id, target_user_id: parsed.data.user_id, role: parsed.data.role },
  });

  const [member] = await hydrateMembers(service, [data as MembershipRow]);
  return NextResponse.json({ member });
}

export async function DELETE(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const actor = await getActorMembership(service, params.id, user.id);
  if (!actor) return apiError("Workspace not found.", 404);
  if (!canManageWorkspace(actor.role)) return apiError("Only owners and admins can remove people.", 403);

  const { searchParams } = new URL(request.url);
  const invitationId = searchParams.get("invitation_id");
  if (invitationId) {
    const { error } = await service
      .from("workspace_invitations")
      .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
      .eq("id", invitationId)
      .eq("workspace_id", params.id);
    if (error) return apiError(error.message, 500);
    return NextResponse.json({ revoked: true });
  }

  const userId = searchParams.get("user_id");
  if (!userId) return apiError("Missing user_id.", 400);

  const target = await getActorMembership(service, params.id, userId);
  if (!target) return apiError("Member not found.", 404);
  if (target.role === "owner" && await getOwnerCount(service, params.id) <= 1) {
    return apiError("A workspace must have at least one owner.", 409);
  }
  if (target.role === "owner" && actor.role !== "owner") {
    return apiError("Admins cannot remove owners.", 403);
  }

  const { error } = await service
    .from("workspace_memberships")
    .delete()
    .eq("workspace_id", params.id)
    .eq("user_id", userId);

  if (error) return apiError(error.message, 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "warning",
    source: "Workspace",
    event: "workspace.member.removed",
    status: "completed",
    message: "User removed a member from a workspace.",
    details: { workspace_id: params.id, target_user_id: userId },
  });

  return NextResponse.json({ removed: true });
}
