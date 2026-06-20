import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace, canContributeToWorkspace } from "@/lib/workspaces";

type AnyDb = { from(table: string): any };

const PatchSchema = z.object({ name: z.string().trim().min(1).max(80) });

/** PATCH /api/devices/[id] — rename a device. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) return apiError("Viewers cannot edit devices.", 403);

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid request body.", 400);

  const db = createServiceClient() as unknown as AnyDb;
  const { data, error } = await db
    .from("devices")
    .update({ name: parsed.data.name })
    .eq("id", id)
    .eq("workspace_id", ws.workspaceId)
    .select("id, name")
    .maybeSingle();
  if (error) return apiError((error as { message: string }).message, 500);
  if (!data) return apiError("Not found", 404);
  return NextResponse.json({ device: data });
}

/**
 * DELETE /api/devices/[id] — revoke a device. Its token is rejected immediately
 * and any operations it has not finished are cancelled so suspended runs fail
 * fast instead of hanging until timeout. The row is kept (soft-revoke) for audit.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) return apiError("Viewers cannot revoke devices.", 403);

  const db = createServiceClient() as unknown as AnyDb;
  const { data, error } = await db
    .from("devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", ws.workspaceId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) return apiError((error as { message: string }).message, 500);
  if (!data) return apiError("Not found", 404);

  // Cancel any in-flight operations addressed to this device.
  await db
    .from("file_operations")
    .update({
      status: "cancelled",
      error: "Device was revoked.",
      completed_at: new Date().toISOString(),
    })
    .eq("device_id", id)
    .in("status", ["pending", "claimed", "running"]);

  return NextResponse.json({ revoked: true });
}
