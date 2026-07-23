import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";
import { randomBytes } from "crypto";

const InviteMemberSchema = z.object({
  email: z
    .string()
    .email()
    .transform((e) => e.trim().toLowerCase()),
  role: z.enum(["admin", "editor", "viewer"]),
});

const UpdateMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["owner", "admin", "editor", "viewer"]),
});

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type MembershipRow = {
  id: string;
  org_id: string;
  user_id: string;
  role: string;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

type InviteRow = {
  id: string;
  org_id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
};

async function getMembership(
  service: LooseServiceClient,
  orgId: string,
  userId: string
): Promise<MembershipRow | null> {
  const { data } = await service
    .from("org_memberships")
    .select("id, org_id, user_id, role, invited_by, invited_at, accepted_at, created_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data ?? null) as MembershipRow | null;
}

async function hydrateMembers(
  service: LooseServiceClient,
  memberships: MembershipRow[]
) {
  const userIds = memberships.map((m) => m.user_id);
  if (userIds.length === 0) return [];

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

/**
 * GET /api/orgs/[orgId]/members — List org members.
 */
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ orgId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;

  const actor = await getMembership(service, params.orgId, user.id);
  if (!actor) return apiError("Organization not found.", 404);

  const { data: memberships, error } = await service
    .from("org_memberships")
    .select("id, org_id, user_id, role, invited_by, invited_at, accepted_at, created_at")
    .eq("org_id", params.orgId)
    .order("created_at", { ascending: true });

  if (error) return apiError(error.message, 500);

  const rows = (memberships ?? []) as MembershipRow[];

  // Also fetch pending invites
  const { data: invites } = await service
    .from("org_invites")
    .select("id, org_id, email, role, token, expires_at, created_at, accepted_at")
    .eq("org_id", params.orgId)
    .is("accepted_at", null)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    actor_role: actor.role,
    members: await hydrateMembers(service, rows),
    invitations: (invites ?? []) as InviteRow[],
  });
}

/**
 * POST /api/orgs/[orgId]/members — Invite member by email.
 * Creates an org_invites record with a unique token.
 */
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ orgId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;

  const actor = await getMembership(service, params.orgId, user.id);
  if (!actor) return apiError("Organization not found.", 404);
  if (actor.role !== "owner" && actor.role !== "admin") {
    return apiError("Only owners and admins can invite members.", 403);
  }

  const parsed = InviteMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  // Check for existing open invite
  const { data: existingInvite } = await service
    .from("org_invites")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("email", parsed.data.email)
    .is("accepted_at", null)
    .maybeSingle();

  if (existingInvite) {
    return apiError("An active invitation already exists for this email.", 409);
  }

  // Check if already a member
  const { data: existingAuthUser } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const targetUser = existingAuthUser.users.find(
    (u: { email?: string | null }) => u.email?.trim().toLowerCase() === parsed.data.email
  );

  if (targetUser) {
    const existingMembership = await getMembership(service, params.orgId, targetUser.id);
    if (existingMembership) {
      return apiError("This user is already a member of the organization.", 409);
    }
  }

  // Generate a unique invite token
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  const { data: invite, error: inviteError } = await service
    .from("org_invites")
    .insert({
      org_id: params.orgId,
      email: parsed.data.email,
      role: parsed.data.role,
      token,
      expires_at: expiresAt,
    } as never)
    .select("id, org_id, email, role, token, expires_at, created_at, accepted_at")
    .single();

  if (inviteError || !invite) {
    return apiError(inviteError?.message ?? "Invitation could not be created.", 500);
  }

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Organization",
    event: "org.invite.created",
    status: "completed",
    message: "User invited someone to an organization.",
    details: { org_id: params.orgId, email: parsed.data.email, role: parsed.data.role },
  });

  return NextResponse.json({ invitation: invite as InviteRow }, { status: 201 });
}

/**
 * PATCH /api/orgs/[orgId]/members — Change a member's role (owner/admin only).
 */
export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ orgId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const actor = await getMembership(service, params.orgId, user.id);
  if (!actor) return apiError("Organization not found.", 404);
  if (actor.role !== "owner" && actor.role !== "admin") {
    return apiError("Only owners and admins can update member roles.", 403);
  }

  const parsed = UpdateMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  // Only owners can assign the owner role
  if (parsed.data.role === "owner" && actor.role !== "owner") {
    return apiError("Only the owner can assign the owner role.", 403);
  }

  const target = await getMembership(service, params.orgId, parsed.data.user_id);
  if (!target) return apiError("Member not found.", 404);

  // Prevent removing the last owner
  if (target.role === "owner" && parsed.data.role !== "owner") {
    const { data: owners } = await service
      .from("org_memberships")
      .select("id")
      .eq("org_id", params.orgId)
      .eq("role", "owner");

    if ((owners ?? []).length <= 1) {
      return apiError("An organization must have at least one owner.", 409);
    }
  }

  // Admins cannot change owner roles
  if (target.role === "owner" && actor.role !== "owner") {
    return apiError("Admins cannot change owner roles.", 403);
  }

  const { error } = await service
    .from("org_memberships")
    .update({ role: parsed.data.role } as never)
    .eq("org_id", params.orgId)
    .eq("user_id", parsed.data.user_id);

  if (error) return apiError(error.message, 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Organization",
    event: "org.member.role_updated",
    status: "completed",
    message: "User updated an organization member role.",
    details: { org_id: params.orgId, target_user_id: parsed.data.user_id, role: parsed.data.role },
  });

  return NextResponse.json({ updated: true });
}

/**
 * DELETE /api/orgs/[orgId]/members — Remove a member or revoke an invitation.
 * Query params: ?user_id=<uuid> to remove a member, ?invite_id=<uuid> to revoke an invite.
 */
export async function DELETE(
  request: Request,
  { params: routeParams }: { params: Promise<{ orgId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const actor = await getMembership(service, params.orgId, user.id);
  if (!actor) return apiError("Organization not found.", 404);
  if (actor.role !== "owner" && actor.role !== "admin") {
    return apiError("Only owners and admins can remove people.", 403);
  }

  const { searchParams } = new URL(request.url);
  const inviteId = searchParams.get("invite_id");

  if (inviteId) {
    // Revoke an invitation by deleting it
    const { error } = await service
      .from("org_invites")
      .delete()
      .eq("id", inviteId)
      .eq("org_id", params.orgId);

    if (error) return apiError(error.message, 500);

    await writeAppLog(service, {
      userId: user.id,
      level: "info",
      source: "Organization",
      event: "org.invite.revoked",
      status: "completed",
      message: "User revoked an organization invitation.",
      details: { org_id: params.orgId, invite_id: inviteId },
    });

    return NextResponse.json({ revoked: true });
  }

  const userId = searchParams.get("user_id");
  if (!userId) return apiError("Missing user_id or invite_id.", 400);

  const target = await getMembership(service, params.orgId, userId);
  if (!target) return apiError("Member not found.", 404);

  // Cannot remove the owner
  if (target.role === "owner") {
    return apiError("The organization owner cannot be removed.", 403);
  }

  const { error } = await service
    .from("org_memberships")
    .delete()
    .eq("org_id", params.orgId)
    .eq("user_id", userId);

  if (error) return apiError(error.message, 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "warning",
    source: "Organization",
    event: "org.member.removed",
    status: "completed",
    message: "User removed a member from an organization.",
    details: { org_id: params.orgId, target_user_id: userId },
  });

  return NextResponse.json({ removed: true });
}
