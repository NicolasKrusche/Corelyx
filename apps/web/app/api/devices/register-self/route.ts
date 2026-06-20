import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { checkLocalFilesAccess } from "@/lib/limits";
import {
  generateDeviceToken,
  deviceTokenPrefix,
  normalizePlatform,
} from "@/lib/devices";
import { hashToken } from "@/lib/personal-tokens";

type AnyDb = { from(table: string): any };

const MAX_DEVICES_PER_WORKSPACE = 20;

// The desktop shell calls this once, post-login, when it has no device token yet.
// It mints a token for the authenticated session so the user never copy-pastes
// anything — the manual /api/devices POST stays for advanced/headless pairing.
const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  platform: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);

  const gate = await checkLocalFilesAccess(user.id, ws.workspaceId);
  if (!gate.allowed)
    return apiError(gate.upgradeMessage ?? gate.reason ?? "Upgrade required.", 403, "PLAN_LIMIT");

  const parsed = RegisterSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("Invalid request body.", 400);

  const db = createServiceClient() as unknown as AnyDb;

  const { count } = await db
    .from("devices")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws.workspaceId)
    .is("revoked_at", null);
  if (((count as number | null) ?? 0) >= MAX_DEVICES_PER_WORKSPACE) {
    return apiError(
      `This workspace has reached the limit of ${MAX_DEVICES_PER_WORKSPACE} paired devices. Revoke one in Settings → Devices first.`,
      403
    );
  }

  const platform = normalizePlatform(parsed.data.platform);
  const fallbackName =
    platform === "macos"
      ? "Corelyx Desktop (macOS)"
      : platform === "windows"
        ? "Corelyx Desktop (Windows)"
        : platform === "linux"
          ? "Corelyx Desktop (Linux)"
          : "Corelyx Desktop";

  const token = generateDeviceToken();
  const tokenHashed = await hashToken(token);
  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from("devices")
    .insert({
      workspace_id: ws.workspaceId,
      user_id: user.id,
      name: parsed.data.name ?? fallbackName,
      platform,
      token_hash: tokenHashed,
      token_prefix: deviceTokenPrefix(token),
      paired_at: nowIso,
    })
    .select("id, name, platform")
    .single();

  if (error || !data)
    return apiError((error as { message: string } | null)?.message ?? "Could not register device.", 500);

  // The token is returned to the desktop shell, which hands it to the native
  // Bridge over IPC. It is never persisted in the browser.
  return NextResponse.json(
    {
      device: data,
      token,
      // Where the Bridge should call back. The desktop is loading this origin.
      base_url: new URL(request.url).origin,
    },
    { status: 201 }
  );
}
