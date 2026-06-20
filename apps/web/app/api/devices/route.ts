import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace, canContributeToWorkspace } from "@/lib/workspaces";
import { checkLocalFilesAccess } from "@/lib/limits";
import {
  generateDeviceToken,
  deviceTokenPrefix,
  normalizePlatform,
} from "@/lib/devices";
import { hashToken } from "@/lib/personal-tokens";

type AnyDb = { from(table: string): any };

const DEVICE_FIELDS =
  "id, name, platform, token_prefix, paired_at, last_seen_at, revoked_at, created_at";

// Defensive ceiling so a workspace can't accumulate unbounded device rows.
const MAX_DEVICES_PER_WORKSPACE = 20;

const CreateDeviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.string().optional(),
});

/** GET /api/devices — list the workspace's devices, each with its folder grants. */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);

  const db = createServiceClient() as unknown as AnyDb;
  const { data: devices, error } = await db
    .from("devices")
    .select(DEVICE_FIELDS)
    .eq("workspace_id", ws.workspaceId)
    .order("created_at", { ascending: false });
  if (error) return apiError((error as { message: string }).message, 500);

  const deviceRows = (devices as Array<{ id: string }>) ?? [];
  const ids = deviceRows.map((d) => d.id);
  let grantsByDevice: Record<string, unknown[]> = {};
  if (ids.length) {
    const { data: grants } = await db
      .from("device_folder_grants")
      .select("id, device_id, path, permission, created_at")
      .in("device_id", ids);
    grantsByDevice = ((grants as Array<{ device_id: string }>) ?? []).reduce(
      (acc, g) => {
        (acc[g.device_id] ??= []).push(g);
        return acc;
      },
      {} as Record<string, unknown[]>
    );
  }

  const result = deviceRows.map((d) => ({ ...d, grants: grantsByDevice[d.id] ?? [] }));
  return NextResponse.json({ devices: result });
}

/**
 * POST /api/devices — pair a new device. Returns the device token in plaintext
 * exactly ONCE (only its hash is stored). The desktop Bridge stores this token
 * and presents it on every poll/submit.
 */
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role))
    return apiError("Viewers cannot pair devices.", 403);

  const gate = await checkLocalFilesAccess(user.id, ws.workspaceId);
  if (!gate.allowed) return apiError(gate.upgradeMessage ?? gate.reason ?? "Upgrade required.", 403, "PLAN_LIMIT");

  const parsed = CreateDeviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid request body.", 400);

  const db = createServiceClient() as unknown as AnyDb;

  const { count } = await db
    .from("devices")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws.workspaceId)
    .is("revoked_at", null);
  if (((count as number | null) ?? 0) >= MAX_DEVICES_PER_WORKSPACE) {
    return apiError(
      `This workspace has reached the limit of ${MAX_DEVICES_PER_WORKSPACE} paired devices. Revoke one first.`,
      403
    );
  }

  const token = generateDeviceToken();
  const tokenHashed = await hashToken(token);
  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from("devices")
    .insert({
      workspace_id: ws.workspaceId,
      user_id: user.id,
      name: parsed.data.name,
      platform: normalizePlatform(parsed.data.platform),
      token_hash: tokenHashed,
      token_prefix: deviceTokenPrefix(token),
      paired_at: nowIso,
    })
    .select(DEVICE_FIELDS)
    .single();

  if (error || !data)
    return apiError((error as { message: string } | null)?.message ?? "Could not pair device.", 500);

  return NextResponse.json(
    {
      device: { ...(data as Record<string, unknown>), grants: [] },
      token,
      message: "Copy this device token now — it will not be shown again.",
    },
    { status: 201 }
  );
}
