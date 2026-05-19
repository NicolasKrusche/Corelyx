import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canManageWorkspace, type WorkspaceRole } from "@/lib/workspaces";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type FolderRow = {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const CreateFolderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().optional(),
});

async function getMembership(service: LooseServiceClient, workspaceId: string, userId: string) {
  const { data } = await service
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role: WorkspaceRole } | null);
}

export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const membership = await getMembership(service, params.id, user.id);
  if (!membership) return apiError("Workspace not found.", 404);

  const { data, error } = await service
    .from("workspace_folders")
    .select("id, workspace_id, name, color, created_by, created_at, updated_at")
    .eq("workspace_id", params.id)
    .order("created_at", { ascending: true });

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ folders: (data ?? []) as FolderRow[] });
}

export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const membership = await getMembership(service, params.id, user.id);
  if (!membership) return apiError("Workspace not found.", 404);
  if (!canManageWorkspace(membership.role)) return apiError("Only owners and admins can create folders.", 403);

  const parsed = CreateFolderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { data, error } = await service
    .from("workspace_folders")
    .insert({
      workspace_id: params.id,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
      created_by: user.id,
    } as never)
    .select("id, workspace_id, name, color, created_by, created_at, updated_at")
    .single();

  if (error || !data) return apiError(error?.message ?? "Could not create folder.", 500);
  return NextResponse.json({ folder: data as FolderRow }, { status: 201 });
}
