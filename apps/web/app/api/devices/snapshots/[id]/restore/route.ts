import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace, canContributeToWorkspace } from "@/lib/workspaces";
import { checkLocalFilesAccess } from "@/lib/limits";

type AnyDb = { from(table: string): any };

/**
 * POST /api/devices/snapshots/[id]/restore — roll a file back to a snapshot.
 *
 * Enqueues a `restore` file_operation addressed to the snapshot's device. The
 * Bridge picks it up, re-validates the original path against its current grants,
 * and writes the saved bytes back (or deletes a file the op had created). The
 * snapshot bytes never leave the device — only the `ref` travels.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) return apiError("Viewers cannot restore files.", 403);

  const gate = await checkLocalFilesAccess(user.id, ws.workspaceId);
  if (!gate.allowed)
    return apiError(gate.upgradeMessage ?? gate.reason ?? "Upgrade required.", 403, "PLAN_LIMIT");

  const db = createServiceClient() as unknown as AnyDb;

  // The snapshot must belong to this workspace.
  const { data: snap } = await db
    .from("file_snapshots")
    .select("id, device_id, snapshot_ref, original_path, expires_at")
    .eq("id", id)
    .eq("workspace_id", ws.workspaceId)
    .maybeSingle();
  if (!snap) return apiError("Snapshot not found.", 404);
  const snapshot = snap as {
    device_id: string;
    snapshot_ref: string;
    original_path: string;
    expires_at: string | null;
  };

  if (snapshot.expires_at && new Date(snapshot.expires_at).getTime() < Date.now()) {
    return apiError("This snapshot has expired and is no longer available to restore.", 410);
  }

  // The target device must still be active.
  const { data: device } = await db
    .from("devices")
    .select("id, revoked_at")
    .eq("id", snapshot.device_id)
    .eq("workspace_id", ws.workspaceId)
    .maybeSingle();
  if (!device) return apiError("The device for this snapshot no longer exists.", 404);
  if ((device as { revoked_at: string | null }).revoked_at)
    return apiError("The device for this snapshot has been revoked.", 409);

  // Enqueue the restore as a normal file_operation (no run — it's user-initiated).
  const { data: opRow, error } = await db
    .from("file_operations")
    .insert({
      device_id: snapshot.device_id,
      workspace_id: ws.workspaceId,
      user_id: user.id,
      op_type: "restore",
      args: { ref: snapshot.snapshot_ref, path: snapshot.original_path },
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !opRow)
    return apiError((error as { message: string } | null)?.message ?? "Could not queue restore.", 500);

  // Optimistically stamp restored_at so the history reflects the request. The
  // queued op's own status is the source of truth for whether it actually ran.
  await db.from("file_snapshots").update({ restored_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ ok: true, operation_id: (opRow as { id: string }).id }, { status: 202 });
}
