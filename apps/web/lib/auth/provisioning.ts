import type { User } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/api";
import type { WorkspaceRole } from "@/lib/workspace-types";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type MembershipRow = {
  workspace_id: string;
  role: WorkspaceRole;
  created_at: string;
};

function defaultWorkspaceName(user: Pick<User, "email" | "user_metadata">) {
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : "";
  const emailName = user.email?.split("@")[0] ?? "";
  const name = (metadataName || emailName).trim();
  return name ? `${name}'s Workspace` : "My Workspace";
}

async function acceptPendingInvitations(
  service: LooseServiceClient,
  userId: string,
  email?: string | null
) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return;

  const { data: invitations, error } = await service
    .from("workspace_invitations")
    .select("id, workspace_id, role, invited_by")
    .eq("email", normalizedEmail)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (error) throw error;

  await Promise.all(
    ((invitations ?? []) as Array<{
      id: string;
      workspace_id: string;
      role: Exclude<WorkspaceRole, "owner">;
      invited_by: string | null;
    }>).map(async (invitation) => {
      const { error: membershipError } = await service
        .from("workspace_memberships")
        .upsert(
          {
            workspace_id: invitation.workspace_id,
            user_id: userId,
            role: invitation.role,
            created_by: invitation.invited_by,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "workspace_id,user_id" }
        );
      if (membershipError) throw membershipError;

      const { error: invitationError } = await service
        .from("workspace_invitations")
        .update({
          accepted_by: userId,
          accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", invitation.id);
      if (invitationError) throw invitationError;
    })
  );
}

export async function ensureUserProvisioned(user: Pick<User, "id" | "email" | "user_metadata">) {
  const service = createServiceClient() as LooseServiceClient;

  const { error: profileError } = await service
    .from("profiles")
    .upsert({ id: user.id, updated_at: new Date().toISOString() } as never, {
      onConflict: "id",
      ignoreDuplicates: false,
    });
  if (profileError) throw profileError;

  await acceptPendingInvitations(service, user.id, user.email);

  const { data: membership, error: membershipError } = await service
    .from("workspace_memberships")
    .select("workspace_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;

  if (membership) {
    const row = membership as MembershipRow;
    const { error } = await service
      .from("profiles")
      .update({ org_id: row.workspace_id, updated_at: new Date().toISOString() } as never)
      .eq("id", user.id)
      .is("org_id", null);
    if (error) throw error;
    return { workspaceId: row.workspace_id, role: row.role };
  }

  const { data: workspace, error: workspaceError } = await service
    .from("workspaces")
    .insert({
      name: defaultWorkspaceName(user),
      created_by: user.id,
    } as never)
    .select("id")
    .single();
  if (workspaceError || !workspace) {
    throw workspaceError ?? new Error("Workspace could not be created.");
  }

  const workspaceId = (workspace as { id: string }).id;
  const { error: ownerError } = await service.from("workspace_memberships").insert({
    workspace_id: workspaceId,
    user_id: user.id,
    role: "owner",
    created_by: user.id,
  } as never);
  if (ownerError) throw ownerError;

  const { error: updateProfileError } = await service
    .from("profiles")
    .update({ org_id: workspaceId, updated_at: new Date().toISOString() } as never)
    .eq("id", user.id);
  if (updateProfileError) throw updateProfileError;

  return { workspaceId, role: "owner" as const };
}
