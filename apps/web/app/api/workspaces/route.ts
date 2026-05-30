import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";
import { canManageWorkspace, type WorkspaceRole } from "@/lib/workspaces";
import { checkWorkspaceLimit } from "@/lib/limits";
import { ensureUserProvisioned } from "@/lib/auth/provisioning";

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
  z.object({
    action: z.literal("update_settings"),
    workspace_id: z.string().uuid(),
    description: z.string().max(300).nullable().optional(),
    default_program_visibility: z.enum(["workspace", "restricted"]).optional(),
    members_can_create_programs: z.boolean().optional(),
    default_execution_mode: z.enum(["autonomous", "supervised", "manual"]).optional(),
    default_conflict_policy: z.enum(["queue", "skip", "fail"]).optional(),
    compliance_mode: z.enum(["standard", "eu_only"]).optional(),
    execution_log_retention_days: z.number().int().positive().optional(),
    prompt_retention_days: z.number().int().nonnegative().optional(),
    output_retention_days: z.number().int().nonnegative().optional(),
    approval_record_retention_days: z.number().int().positive().optional(),
    secret_rotation_reminder_days: z.number().int().positive().optional(),
    store_full_prompts: z.boolean().optional(),
    store_full_outputs: z.boolean().optional(),
    data_region: z.string().trim().min(1).max(80).optional(),
  }),
]);

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type WorkspaceRow = {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  default_program_visibility: "workspace" | "restricted";
  members_can_create_programs: boolean;
  compliance_mode: "standard" | "eu_only";
  execution_log_retention_days: number;
  prompt_retention_days: number;
  output_retention_days: number;
  approval_record_retention_days: number;
  secret_rotation_reminder_days: number;
  store_full_prompts: boolean;
  store_full_outputs: boolean;
  data_region: string;
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

type WorkspaceRenameRow = {
  id: string;
  name: string;
  created_by: string | null;
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
  try {
    await ensureUserProvisioned(user);
  } catch {
    return apiError("Workspace could not be prepared.", 500);
  }

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
  let activeWorkspaceId = (profileRes.data as { org_id?: string | null } | null)?.org_id ?? null;

  if (!activeWorkspaceId || !workspaceIds.includes(activeWorkspaceId)) {
    activeWorkspaceId = workspaceIds[0] ?? null;
    if (activeWorkspaceId) {
      await service
        .from("profiles")
        .update({ org_id: activeWorkspaceId, updated_at: new Date().toISOString() } as never)
        .eq("id", user.id);
    }
  }

  let workspaces: WorkspaceRow[] = [];
  let memberCounts = new Map<string, number>();

  if (workspaceIds.length > 0) {
    const [workspacesRes, countsRes] = await Promise.all([
      service
        .from("workspaces")
        .select("id, name, logo_url, description, default_program_visibility, members_can_create_programs, compliance_mode, execution_log_retention_days, prompt_retention_days, output_retention_days, approval_record_retention_days, secret_rotation_reminder_days, store_full_prompts, store_full_outputs, data_region, created_by, created_at, updated_at")
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
    active_workspace_id: activeWorkspaceId,
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
  const limitCheck = await checkWorkspaceLimit(user.id);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: "WORKSPACE_LIMIT_REACHED", message: limitCheck.upgradeMessage ?? limitCheck.reason },
      { status: 403 }
    );
  }

  const { data: workspace, error } = await service
    .from("workspaces")
    .insert({
      name: parsed.data.name,
      created_by: user.id,
    } as never)
    .select("id, name, logo_url, description, default_program_visibility, members_can_create_programs, compliance_mode, execution_log_retention_days, prompt_retention_days, output_retention_days, approval_record_retention_days, secret_rotation_reminder_days, store_full_prompts, store_full_outputs, data_region, created_by, created_at, updated_at")
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
    const { data, error } = await service
      .from("profiles")
      .update({ org_id: parsed.data.workspace_id, updated_at: new Date().toISOString() } as never)
      .eq("id", user.id)
      .select("org_id")
      .maybeSingle();

    if (error) return apiError(error.message, 500);
    if ((data as { org_id?: string } | null)?.org_id !== parsed.data.workspace_id) {
      return apiError("Workspace could not be activated.", 500);
    }
    return NextResponse.json({ active_workspace_id: parsed.data.workspace_id });
  }

  if (!canManageWorkspace(membership.role)) {
    return apiError("Only workspace owners and admins can rename a workspace.", 403);
  }

  if (parsed.data.action === "update_settings") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.description !== undefined) patch.description = parsed.data.description;
    if (parsed.data.default_program_visibility !== undefined) patch.default_program_visibility = parsed.data.default_program_visibility;
    if (parsed.data.members_can_create_programs !== undefined) patch.members_can_create_programs = parsed.data.members_can_create_programs;
    if (parsed.data.default_execution_mode !== undefined) patch.default_execution_mode = parsed.data.default_execution_mode;
    if (parsed.data.default_conflict_policy !== undefined) patch.default_conflict_policy = parsed.data.default_conflict_policy;
    if (parsed.data.compliance_mode !== undefined) patch.compliance_mode = parsed.data.compliance_mode;
    if (parsed.data.execution_log_retention_days !== undefined) patch.execution_log_retention_days = parsed.data.execution_log_retention_days;
    if (parsed.data.prompt_retention_days !== undefined) patch.prompt_retention_days = parsed.data.prompt_retention_days;
    if (parsed.data.output_retention_days !== undefined) patch.output_retention_days = parsed.data.output_retention_days;
    if (parsed.data.approval_record_retention_days !== undefined) patch.approval_record_retention_days = parsed.data.approval_record_retention_days;
    if (parsed.data.secret_rotation_reminder_days !== undefined) patch.secret_rotation_reminder_days = parsed.data.secret_rotation_reminder_days;
    if (parsed.data.store_full_prompts !== undefined) patch.store_full_prompts = parsed.data.store_full_prompts;
    if (parsed.data.store_full_outputs !== undefined) patch.store_full_outputs = parsed.data.store_full_outputs;
    if (parsed.data.data_region !== undefined) patch.data_region = parsed.data.data_region;

    const { data, error } = await service
      .from("workspaces")
      .update(patch as never)
      .eq("id", parsed.data.workspace_id)
      .select("id, name, logo_url, description, default_program_visibility, members_can_create_programs, compliance_mode, execution_log_retention_days, prompt_retention_days, output_retention_days, approval_record_retention_days, secret_rotation_reminder_days, store_full_prompts, store_full_outputs, data_region, default_execution_mode, default_conflict_policy, created_by, created_at, updated_at")
      .single();

    if (error || !data) return apiError(error?.message ?? "Settings could not be updated.", 500);
    return NextResponse.json({ workspace: data as WorkspaceRow });
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

  return NextResponse.json({ workspace: data as WorkspaceRenameRow });
}
