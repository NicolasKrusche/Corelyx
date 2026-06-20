import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateDevice, deviceTokenFromRequest } from "@/lib/devices";
import { dispatchFileWatchEvent } from "@/lib/triggers/file-watch";

// A single Bridge poll cycle batches the changes it saw. Cap the batch so a busy
// folder can't flood one request; the Bridge re-sends the rest next cycle.
const MAX_EVENTS_PER_REQUEST = 50;

const EventSchema = z.object({
  trigger_id: z.string().uuid(),
  event: z.enum(["created", "modified", "deleted"]),
  path: z.string().min(1).max(4096),
  name: z.string().min(1).max(1024),
  is_dir: z.boolean().optional(),
});

const BodySchema = z.object({
  events: z.array(EventSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
});

function bridgeError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/bridge/events — the desktop Bridge reports file changes it observed
 * inside watched folders.
 *
 * Authenticated by the device token. Each event names the file_watch trigger the
 * Bridge matched it against; the server re-validates that match (device ownership,
 * event kind, name pattern, entitlement, limits) before firing the program, so a
 * buggy or hostile Bridge can only ever fire watches that target its own device.
 * The Bridge sees only per-event {fired} booleans, never any program internals.
 */
export async function POST(request: Request) {
  const device = await authenticateDevice(deviceTokenFromRequest(request));
  if (!device) return bridgeError("Invalid or revoked device token.", 401);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bridgeError("Invalid request body.", 400);

  const results = await Promise.all(
    parsed.data.events.map(async (ev) => {
      const outcome = await dispatchFileWatchEvent({
        device,
        triggerId: ev.trigger_id,
        event: ev.event,
        path: ev.path,
        name: ev.name,
        isDir: ev.is_dir,
      });
      return {
        trigger_id: ev.trigger_id,
        fired: outcome.fired,
        run_id: outcome.runId,
      };
    })
  );

  return NextResponse.json({ ok: true, results });
}
