import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/api";
import { authenticateDevice, deviceTokenFromRequest } from "@/lib/devices";
import { watchesForDevice } from "@/lib/triggers/file-watch";

type AnyDb = { from(table: string): any };

// How many operations a single poll may claim. The Bridge runs them then polls
// again — keeping this small bounds blast radius and keeps responses lean.
const MAX_CLAIM_PER_POLL = 10;

function bridgeError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/bridge/poll — the desktop Bridge asks for work.
 *
 * Authenticated by the device token (Bearer). Returns the device's current
 * folder grants (the Bridge enforces the path sandbox locally against these) and
 * claims up to a few pending operations addressed to this device. All DB access
 * is server-side via the service-role client; the Bridge never touches Supabase
 * directly.
 */
export async function POST(request: Request) {
  const device = await authenticateDevice(deviceTokenFromRequest(request));
  if (!device) return bridgeError("Invalid or revoked device token.", 401);

  const db = createServiceClient() as unknown as AnyDb;
  const nowIso = new Date().toISOString();

  const { data: grants } = await db
    .from("device_folder_grants")
    .select("path, permission")
    .eq("device_id", device.id);

  // Active folder watches this device should be running (file_watch triggers).
  // The Bridge starts/stops `notify` watchers to match this list each poll.
  const watches = await watchesForDevice(db, device);

  // Pending, unexpired operations addressed to this device, oldest first.
  const { data: pending } = await db
    .from("file_operations")
    .select("id, op_type, args, requested_at")
    .eq("device_id", device.id)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("requested_at", { ascending: true })
    .limit(MAX_CLAIM_PER_POLL);

  const ops = (pending as Array<{ id: string }>) ?? [];
  if (ops.length) {
    // Claim them so a re-poll (or a second instance) won't run them again.
    await db
      .from("file_operations")
      .update({ status: "claimed", claimed_at: nowIso })
      .in(
        "id",
        ops.map((o) => o.id)
      )
      .eq("status", "pending");
  }

  return NextResponse.json({
    device: { id: device.id, name: device.name, platform: device.platform },
    grants: (grants as unknown[]) ?? [],
    operations: ops,
    watches,
  });
}
