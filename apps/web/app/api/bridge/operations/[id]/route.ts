import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/api";
import { authenticateDevice, deviceTokenFromRequest } from "@/lib/devices";

type AnyDb = { from(table: string): any };

// Caps the size of a result the Bridge can post back, so a large file read can't
// bloat the queue row. Larger payloads are a Phase 3 streaming concern.
const MAX_RESULT_BYTES = 1_000_000;

// Prior-state snapshots the Bridge saved before mutating files in this op. The
// bytes stay on the device; we only index this metadata so the user can browse
// history and trigger a restore.
const SnapshotSchema = z.object({
  ref: z.string().min(1).max(128),
  original_path: z.string().min(1).max(4096),
  operation: z.string().min(1).max(32),
  size_bytes: z.number().int().nonnegative(),
  existed: z.boolean(),
});

const SubmitSchema = z.object({
  status: z.enum(["done", "error"]),
  result: z.unknown().optional(),
  error: z.string().max(2000).optional(),
  snapshots: z.array(SnapshotSchema).max(50).optional(),
});

// Keep this in sync with the Bridge's snapshot retention window (snapshot.rs).
const SNAPSHOT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function bridgeError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/bridge/operations/[id] — the Bridge reports the outcome of an op.
 *
 * Authenticated by the device token. The operation must belong to this device
 * and still be in flight. Writing the terminal row resumes the suspended run
 * (the runtime is waiting on a Realtime update / poll of this row).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const device = await authenticateDevice(deviceTokenFromRequest(request));
  if (!device) return bridgeError("Invalid or revoked device token.", 401);

  const parsed = SubmitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bridgeError("Invalid request body.", 400);

  if (parsed.data.status === "done" && parsed.data.result !== undefined) {
    if (JSON.stringify(parsed.data.result).length > MAX_RESULT_BYTES) {
      return bridgeError("Result payload too large.", 413);
    }
  }

  const db = createServiceClient() as unknown as AnyDb;

  // The op must be addressed to this device and not already finished.
  const { data: op } = await db
    .from("file_operations")
    .select("id, status, device_id, run_id, workspace_id")
    .eq("id", id)
    .eq("device_id", device.id)
    .maybeSingle();
  if (!op) return bridgeError("Operation not found for this device.", 404);
  const opRow = op as { status: string; run_id: string | null; workspace_id: string };
  if (!["pending", "claimed", "running"].includes(opRow.status)) {
    return bridgeError("Operation already finalized.", 409);
  }

  const { data, error } = await db
    .from("file_operations")
    .update({
      status: parsed.data.status,
      result: parsed.data.status === "done" ? (parsed.data.result ?? null) : null,
      error: parsed.data.status === "error" ? (parsed.data.error ?? "Operation failed on the device.") : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("device_id", device.id)
    .in("status", ["pending", "claimed", "running"])
    .select("id, status")
    .maybeSingle();

  if (error) return bridgeError((error as { message: string }).message, 500);
  if (!data) return bridgeError("Operation already finalized.", 409);

  // Index any rollback snapshots this op produced (best-effort — never fail the
  // op finalization on a snapshot-index error; the bytes are safe on the device).
  const snapshots = parsed.data.snapshots ?? [];
  if (parsed.data.status === "done" && snapshots.length > 0) {
    const expiresAt = new Date(Date.now() + SNAPSHOT_RETENTION_MS).toISOString();
    const rows = snapshots.map((s) => ({
      workspace_id: opRow.workspace_id,
      device_id: device.id,
      run_id: opRow.run_id,
      op_id: id,
      snapshot_ref: s.ref,
      original_path: s.original_path,
      operation: s.operation,
      size_bytes: s.size_bytes,
      existed: s.existed,
      expires_at: expiresAt,
    }));
    const { error: snapErr } = await db.from("file_snapshots").insert(rows);
    if (snapErr) {
      console.error("[bridge/operations] failed to index snapshots:", (snapErr as { message: string }).message);
    }
  }

  return NextResponse.json({ ok: true, operation: data });
}
