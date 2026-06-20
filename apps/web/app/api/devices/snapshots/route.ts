import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";

type AnyDb = { from(table: string): any };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/devices/snapshots — the workspace's recent file-change history.
 *
 * Each row is a prior-state snapshot the Bridge saved before a workflow or agent
 * modified a local file. The bytes live on the device; this is the index the user
 * browses to roll a change back. Newest first.
 */
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT)
  );

  const db = createServiceClient() as unknown as AnyDb;
  const { data, error } = await db
    .from("file_snapshots")
    .select(
      "id, device_id, original_path, operation, size_bytes, existed, created_at, restored_at, expires_at, devices(name)"
    )
    .eq("workspace_id", ws.workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return apiError((error as { message: string }).message, 500);

  const snapshots = ((data as Array<Record<string, unknown>>) ?? []).map((row) => ({
    id: row.id,
    device_id: row.device_id,
    device_name: (row.devices as { name?: string } | null)?.name ?? "Device",
    original_path: row.original_path,
    operation: row.operation,
    size_bytes: row.size_bytes,
    existed: row.existed,
    created_at: row.created_at,
    restored_at: row.restored_at,
    expires_at: row.expires_at,
  }));

  return NextResponse.json({ snapshots });
}
