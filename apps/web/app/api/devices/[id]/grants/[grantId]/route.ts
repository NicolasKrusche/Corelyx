import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace, canContributeToWorkspace } from "@/lib/workspaces";

type AnyDb = { from(table: string): any };

/** DELETE /api/devices/[id]/grants/[grantId] — revoke a folder grant. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; grantId: string }> }
) {
  const { id, grantId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) return apiError("Viewers cannot revoke grants.", 403);

  const db = createServiceClient() as unknown as AnyDb;
  const { data, error } = await db
    .from("device_folder_grants")
    .delete()
    .eq("id", grantId)
    .eq("device_id", id)
    .eq("workspace_id", ws.workspaceId)
    .select("id")
    .maybeSingle();
  if (error) return apiError((error as { message: string }).message, 500);
  if (!data) return apiError("Not found", 404);
  return NextResponse.json({ deleted: true });
}
