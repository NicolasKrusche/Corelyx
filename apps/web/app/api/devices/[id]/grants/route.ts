import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace, canContributeToWorkspace } from "@/lib/workspaces";

type AnyDb = { from(table: string): any };

const MAX_GRANTS_PER_DEVICE = 50;

const CreateGrantSchema = z.object({
  path: z.string().trim().min(1).max(1024),
  permission: z.enum(["read", "read_write"]).default("read"),
});

/**
 * POST /api/devices/[id]/grants — grant a device access to a folder.
 *
 * This is the server-side source of truth for the path sandbox. The desktop
 * Bridge still canonicalises and re-checks every path locally (defence in depth),
 * but a folder the device was never granted here can never be reached.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) return apiError("Viewers cannot grant folders.", 403);

  const parsed = CreateGrantSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid request body.", 400);

  const db = createServiceClient() as unknown as AnyDb;

  // The device must belong to this workspace and be active.
  const { data: device } = await db
    .from("devices")
    .select("id, revoked_at")
    .eq("id", id)
    .eq("workspace_id", ws.workspaceId)
    .maybeSingle();
  if (!device) return apiError("Not found", 404);
  if ((device as { revoked_at: string | null }).revoked_at)
    return apiError("This device has been revoked.", 409);

  const { count } = await db
    .from("device_folder_grants")
    .select("id", { count: "exact", head: true })
    .eq("device_id", id);
  if (((count as number | null) ?? 0) >= MAX_GRANTS_PER_DEVICE) {
    return apiError(`A device can hold at most ${MAX_GRANTS_PER_DEVICE} folder grants.`, 403);
  }

  const { data, error } = await db
    .from("device_folder_grants")
    .insert({
      device_id: id,
      workspace_id: ws.workspaceId,
      path: parsed.data.path,
      permission: parsed.data.permission,
    })
    .select("id, device_id, path, permission, created_at")
    .single();

  // Unique (device_id, path) — surface a duplicate grant cleanly.
  if (error) {
    const message = (error as { message?: string }).message ?? "";
    if (/duplicate|unique/i.test(message))
      return apiError("That folder is already granted to this device.", 409);
    return apiError(message || "Could not create grant.", 500);
  }
  return NextResponse.json({ grant: data }, { status: 201 });
}
