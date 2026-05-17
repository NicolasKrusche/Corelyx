import { createServiceClient } from "@/lib/api";

export type TriggerEventStatus = "dispatched" | "skipped" | "failed";

/**
 * Record a single trigger firing event.
 *
 * Always fire-and-forget — never awaited on the hot path so it cannot
 * delay or break run dispatch.  Silently swallows errors.
 */
export function recordTriggerEvent(opts: {
  triggerId: string;
  programId: string;
  runId?: string | null;
  source: string;          // 'cron' | 'webhook' | 'program' | 'event' | 'manual'
  status: TriggerEventStatus;
  message?: string | null;
}): void {
  const db = createServiceClient();
  void db
    .from("trigger_events")
    .insert({
      trigger_id: opts.triggerId,
      program_id: opts.programId,
      run_id: opts.runId ?? null,
      source: opts.source,
      status: opts.status,
      message: opts.message ?? null,
    } as never)
    .then(({ error }) => {
      if (error) console.warn("[trigger-events] insert failed:", error.message);
    });
}
