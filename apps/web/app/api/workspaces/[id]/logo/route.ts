import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canManageWorkspace, type WorkspaceRole } from "@/lib/workspaces";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
  storage: any;
};

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;

  const { data: membership } = await service
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return apiError("Workspace not found.", 404);
  if (!canManageWorkspace((membership as { role: WorkspaceRole }).role)) {
    return apiError("Only owners and admins can update the workspace logo.", 403);
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return apiError("No file provided.", 400);
  if (!ALLOWED_MIME.includes(file.type)) return apiError("Only PNG, JPEG, WebP, and GIF images are allowed.", 400);
  if (file.size > MAX_BYTES) return apiError("Image must be under 2 MB.", 400);

  const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `workspace-logos/${params.id}/logo.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await service.storage
    .from("avatars")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) return apiError(uploadError.message, 500);

  const { data: urlData } = service.storage.from("avatars").getPublicUrl(path);
  const logoUrl = (urlData as { publicUrl: string }).publicUrl;

  const { error: updateError } = await service
    .from("workspaces")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() } as never)
    .eq("id", params.id);

  if (updateError) return apiError(updateError.message, 500);

  return NextResponse.json({ logo_url: logoUrl });
}
