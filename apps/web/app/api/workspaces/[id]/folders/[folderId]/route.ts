import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser, type LooseServiceClient } from "@/lib/api";
import { canManageWorkspace, type WorkspaceRole } from "@/lib/workspaces";

const UpdateFolderSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().nullable().optional(),
});

async function resolveMembership(service: LooseServiceClient, workspaceId: string, userId: string) {
  const { data } = await service
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { role: WorkspaceRole } | null;
}

async function resolveFolder(service: LooseServiceClient, folderId: string, workspaceId: string) {
  const { data } = await service
    .from("workspace_folders")
    .select("id, workspace_id")
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return data as { id: string; workspace_id: string } | null;
}

export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string; folderId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const membership = await resolveMembership(service, params.id, user.id);
  if (!membership) return apiError("Workspace not found.", 404);
  if (!canManageWorkspace(membership.role)) return apiError("Only owners and admins can rename folders.", 403);

  const folder = await resolveFolder(service, params.folderId, params.id);
  if (!folder) return apiError("Folder not found.", 404);

  const parsed = UpdateFolderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.color !== undefined) patch.color = parsed.data.color;

  const { data, error } = await service
    .from("workspace_folders")
    .update(patch as never)
    .eq("id", params.folderId)
    .select("id, workspace_id, name, color, created_by, created_at, updated_at")
    .single();

  if (error || !data) return apiError(error?.message ?? "Could not update folder.", 500);
  return NextResponse.json({ folder: data });
}

export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string; folderId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const membership = await resolveMembership(service, params.id, user.id);
  if (!membership) return apiError("Workspace not found.", 404);
  if (!canManageWorkspace(membership.role)) return apiError("Only owners and admins can delete folders.", 403);

  const folder = await resolveFolder(service, params.folderId, params.id);
  if (!folder) return apiError("Folder not found.", 404);

  // Programs with this folder_id get NULL automatically via ON DELETE SET NULL.
  const { error } = await service
    .from("workspace_folders")
    .delete()
    .eq("id", params.folderId);

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ ok: true });
}
