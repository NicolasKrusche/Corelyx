import { createServiceClient } from "@/lib/api";

export type TriggerEventStatus = "dispatched" | "skipped" | "failed";

/**
 * Record a single trigger firing event.
 *
 * Resolves after the insert attempt and silently swallows database errors.
 * Serverless callers that need durable history (notably the cron sweep) must
 * await it; otherwise the platform may freeze the invocation before the
 * background promise reaches Supabase.
 */
export async function recordTriggerEvent(opts: {
  triggerId: string;
  programId: string;
  runId?: string | null;
  source: string;          // 'cron' | 'webhook' | 'program' | 'event' | 'manual'
  status: TriggerEventStatus;
  message?: string | null;
  payload?: unknown;       // optional raw payload (e.g. webhook request body)
}): Promise<void> {
  try {
    const db = createServiceClient();
    // Only include payload when one was captured: PostgREST rejects the whole
    // insert if the column list references a column the live DB doesn't have,
    // so an always-present `payload: null` turns schema drift into silently
    // losing every trigger event.
    const row: Record<string, unknown> = {
      trigger_id: opts.triggerId,
      program_id: opts.programId,
      run_id: opts.runId ?? null,
      source: opts.source,
      status: opts.status,
      message: opts.message ?? null,
    };
    if (opts.payload !== undefined && opts.payload !== null) row.payload = opts.payload;
    const { error } = await db.from("trigger_events").insert(row as never);
    if (error) console.warn("[trigger-events] insert failed:", error.message);
  } catch (error) {
    console.warn(
      "[trigger-events] insert failed:",
      error instanceof Error ? error.message : "unknown error"
    );
  }
}
