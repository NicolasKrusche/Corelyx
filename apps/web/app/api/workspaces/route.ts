import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";
import { canManageWorkspace, type WorkspaceRole } from "@/lib/workspaces";

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const UpdateWorkspaceSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("switch"),
    workspace_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("rename"),
    workspace_id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
  }),
]);

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type WorkspaceRow = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  updated_at: string;
};

async function getMembership(
  service: LooseServiceClient,
  workspaceId: string,
  userId: string
): Promise<MembershipRow | null> {
  const { data } = await service
    .from("workspace_memberships")
    .select("workspace_id, user_id, role, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data ?? null) as MembershipRow | null;
}

async function acceptPendingInvitations(service: LooseServiceClient, userId: string, email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return;

  const { data } = await service
    .from("workspace_invitations")
    .select("id, workspace_id, role, invited_by")
    .eq("email", normalizedEmail)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const invitations = (data ?? []) as Array<{
    id: string;
    workspace_id: string;
    role: Exclude<WorkspaceRole, "owner">;
    invited_by: string | null;
  }>;

  if (invitations.length === 0) return;

  await Promise.all(
    invitations.map(async (invitation) => {
      await service
        .from("workspace_memberships")
        .upsert({
          workspace_id: invitation.workspace_id,
          user_id: userId,
          role: invitation.role,
          created_by: invitation.invited_by,
          updated_at: new Date().toISOString(),
        } as never, { onConflict: "workspace_id,user_id" });

      await service
        .from("workspace_invitations")
        .update({
          accepted_by: userId,
          accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", invitation.id);
    })
  );

  await service
    .from("profiles")
    .update({ org_id: invitations[0].workspace_id } as never)
    .eq("id", userId)
    .is("org_id", null);
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  await acceptPendingInvitations(service, user.id, user.email);

  const [membershipsRes, profileRes] = await Promise.all([
    service
      .from("workspace_memberships")
      .select("workspace_id, user_id, role, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    service
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (membershipsRes.error) return apiError(membershipsRes.error.message, 500);

  const memberships = (membershipsRes.data ?? []) as MembershipRow[];
  const workspaceIds = memberships.map((membership) => membership.workspace_id);

  let workspaces: WorkspaceRow[] = [];
  let memberCounts = new Map<string, number>();

  if (workspaceIds.length > 0) {
    const [workspacesRes, countsRes] = await Promise.all([
      service
        .from("workspaces")
        .select("id, name, created_by, created_at, updated_at")
        .in("id", workspaceIds)
        .order("created_at", { ascending: true }),
      service
        .from("workspace_memberships")
        .select("workspace_id")
        .in("workspace_id", workspaceIds),
    ]);

    if (workspacesRes.error) return apiError(workspacesRes.error.message, 500);

    workspaces = (workspacesRes.data ?? []) as WorkspaceRow[];
    memberCounts = ((countsRes.data ?? []) as Array<{ workspace_id: string }>).reduce(
      (counts, row) => counts.set(row.workspace_id, (counts.get(row.workspace_id) ?? 0) + 1),
      new Map<string, number>()
    );
  }

  const membershipByWorkspace = new Map(
    memberships.map((membership) => [membership.workspace_id, membership])
  );

  return NextResponse.json({
    active_workspace_id: (profileRes.data as { org_id?: string | null } | null)?.org_id ?? null,
    workspaces: workspaces.map((workspace) => ({
      ...workspace,
      role: membershipByWorkspace.get(workspace.id)?.role ?? "viewer",
      member_count: memberCounts.get(workspace.id) ?? 1,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const parsed = CreateWorkspaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;

  const { data: workspace, error } = await service
    .from("workspaces")
    .insert({
      name: parsed.data.name,
      created_by: user.id,
    } as never)
    .select("id, name, created_by, created_at, updated_at")
    .single();

  if (error || !workspace) return apiError(error?.message ?? "Workspace could not be created.", 500);

  const row = workspace as WorkspaceRow;

  const { error: memberError } = await service
    .from("workspace_memberships")
    .insert({
      workspace_id: row.id,
      user_id: user.id,
      role: "owner",
      created_by: user.id,
    } as never);

  if (memberError) return apiError(memberError.message, 500);

  await service
    .from("profiles")
    .update({ org_id: row.id } as never)
    .eq("id", user.id);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Workspace",
    event: "workspace.created",
    status: "completed",
    message: "User created a workspace.",
    details: { workspace_id: row.id, name: row.name },
  });

  return NextResponse.json(
    { workspace: { ...row, role: "owner", member_count: 1 }, active_workspace_id: row.id },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const parsed = UpdateWorkspaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;
  const membership = await getMembership(service, parsed.data.workspace_id, user.id);
  if (!membership) return apiError("Workspace not found.", 404);

  if (parsed.data.action === "switch") {
    const { error } = await service
      .from("profiles")
      .update({ org_id: parsed.data.workspace_id } as never)
      .eq("id", user.id);

    if (error) return apiError(error.message, 500);
    return NextResponse.json({ active_workspace_id: parsed.data.workspace_id });
  }

  if (!canManageWorkspace(membership.role)) {
    return apiError("Only workspace owners and admins can rename a workspace.", 403);
  }

  const { data, error } = await service
    .from("workspaces")
    .update({ name: parsed.data.name, updated_at: new Date().toISOString() } as never)
    .eq("id", parsed.data.workspace_id)
    .select("id, name, created_by, created_at, updated_at")
    .single();

  if (error || !data) return apiError(error?.message ?? "Workspace could not be updated.", 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Workspace",
    event: "workspace.renamed",
    status: "completed",
    message: "User renamed a workspace.",
    details: { workspace_id: parsed.data.workspace_id, name: parsed.data.name },
  });

  return NextResponse.json({ workspace: data as WorkspaceRow });
}
