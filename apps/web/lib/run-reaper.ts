import { createServiceClient } from "@/lib/api";
import { getRuntimeUrl } from "@/lib/runtime-url";
import {
  buildRuntimeExecuteHeaders,
  formatRuntimeRejection,
  isRuntimeDispatchConfigError,
  readRuntimeRejectionDetails,
} from "@/lib/runtime-dispatch";

/* Stuck-run reaper: recovers runs orphaned by a crashed runtime process.

   A run's own try/finally normally marks it completed/failed when execution
   ends — including on its internal RUN_TIMEOUT_SECONDS (600s) timeout. If the
   runtime process itself dies mid-run (crash, OOM, deploy restart), that
   finally never runs and the row is stuck at status "running" forever with
   no other process able to notice. This sweep finds those and re-dispatches
   them to the runtime, or gives up after MAX_REAP_ATTEMPTS.

   Rides the same 60s heartbeat as the cron sweep (see cron-sweep.ts) — no new
   scheduler. Reused, not recreated: the SAME run row is re-dispatched (unlike
   cron-sweep, which inserts a fresh run per fire), preserving the run's
   original id/audit trail. Runs are claimed with the same CAS pattern as
   claimTrigger: the UPDATE only applies if started_at still matches what this
   tick read, so two concurrent ticks — or the original process finishing at
   the last second — can't both act on the same row.

   Caveat: this is crash recovery, not exactly-once resume. The runtime has no
   step-level checkpointing, so a re-dispatched run restarts the workflow from
   its first node, not from where it crashed. Any side effect the first
   (crashed) attempt already completed (an email sent, a Stripe charge, a
   webhook fired) can happen again. That's an inherent limit of recovering
   without durable per-step state — acceptable for "your run didn't just
   vanish," not a promise of exactly-once execution. */

const REAP_THRESHOLD_MS = 15 * 60 * 1000; // well past the runtime's own 600s run timeout
const MAX_REAP_ATTEMPTS = 2;

// Tiers reaped first — matches apps/runtime/db.py's get_user_priority_tier
// (profile tier only), so "priority recovery" means the same thing on both
// the execution-priority and reaper paths.
const PRIORITY_TIERS = new Set(["builder", "unlimited"]);

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

export type RunReaperResult = {
  checked: number;
  reaped: number;
  gaveUp: number;
  skipped: number;
};

type StuckRun = {
  id: string;
  program_id: string;
  user_id: string | null;
  trigger_payload: Record<string, unknown> | null;
  triggered_by: string;
  started_at: string;
  reap_attempts: number;
};

/**
 * Atomically claim a stuck run: either bump it for re-dispatch or mark it
 * permanently failed (attempts exhausted), but only if started_at still
 * matches what this tick read. Returns false when another tick (or the
 * original process finishing late) already changed the row.
 */
async function claimStuckRun(
  db: ReturnType<typeof createServiceClient>,
  run: StuckRun,
  giveUp: boolean
): Promise<boolean> {
  const now = new Date().toISOString();
  const update = giveUp
    ? {
        status: "failed",
        error_message: `Run did not complete after ${MAX_REAP_ATTEMPTS} recovery attempts — the runtime process likely crashed repeatedly on this run.`,
        completed_at: now,
        reap_attempts: run.reap_attempts + 1,
        last_reaped_at: now,
      }
    : {
        started_at: now,
        reap_attempts: run.reap_attempts + 1,
        last_reaped_at: now,
      };

  const { data, error } = await (db as any)
    .from("runs")
    .update(update)
    .eq("id", run.id)
    .eq("status", "running")
    .eq("started_at", run.started_at)
    .select("id");

  if (error) throw new Error(`Failed to claim stuck run ${run.id}: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * Re-dispatch a claimed stuck run to the runtime, preserving its original
 * trigger context. Safe to call concurrently with the cron sweep — this
 * touches a different run than any run cron-sweep would be creating.
 */
async function redispatchRun(
  db: ReturnType<typeof createServiceClient>,
  run: StuckRun,
  logger: Logger
): Promise<boolean> {
  const { data: program, error: progErr } = await (db as any)
    .from("programs")
    .select("id, schema, user_id, workspace_id")
    .eq("id", run.program_id)
    .single();

  if (progErr || !program) {
    await (db as any)
      .from("runs")
      .update({ status: "failed", error_message: "Program no longer exists.", completed_at: new Date().toISOString() })
      .eq("id", run.id);
    logger.warn(`Reaper: run ${run.id} orphaned — program ${run.program_id} not found`);
    return false;
  }

  const { data: linkedConnsRaw } = await (db as any)
    .from("program_connections")
    .select("connection_id, connections(id, name, provider)")
    .eq("program_id", run.program_id);

  const connectionNameToId: Record<string, string> = {};
  for (const row of (linkedConnsRaw ?? []) as Array<{
    connection_id: string;
    connections: { id: string; name: string; provider: string } | null;
  }>) {
    if (row.connections) {
      connectionNameToId[row.connections.name] = row.connections.id;
      connectionNameToId[`${row.connections.provider}:primary`] = row.connections.id;
    }
  }

  try {
    const runtimeBody = JSON.stringify({
      run_id: run.id,
      program_id: run.program_id,
      user_id: program.user_id,
      schema: program.schema,
      triggered_by: run.triggered_by,
      trigger_payload: run.trigger_payload,
      connections: connectionNameToId,
    });
    const runtimeRes = await fetch(`${getRuntimeUrl()}/execute`, {
      method: "POST",
      headers: buildRuntimeExecuteHeaders(runtimeBody),
      body: runtimeBody,
      cache: "no-store",
    });
    if (!runtimeRes.ok) {
      const runtimeError = await readRuntimeRejectionDetails(runtimeRes);
      await (db as any)
        .from("runs")
        .update({ status: "failed", error_message: formatRuntimeRejection(runtimeError), completed_at: new Date().toISOString() })
        .eq("id", run.id);
      logger.error(`Reaper: runtime rejected re-dispatch of run ${run.id} (${runtimeError.status}): ${runtimeError.detail}`);
      return false;
    }
  } catch (error) {
    const authMisconfigured = isRuntimeDispatchConfigError(error);
    const errMsg = authMisconfigured ? "Runtime auth is not configured." : "Runtime is unreachable";
    await (db as any)
      .from("runs")
      .update({ status: "failed", error_message: errMsg, completed_at: new Date().toISOString() })
      .eq("id", run.id);
    logger.error(`Reaper: ${errMsg} while re-dispatching run ${run.id}`);
    return false;
  }

  logger.info(`Reaper: recovered stuck run ${run.id} (program ${run.program_id})`);
  return true;
}

/** Find every run stuck in "running" past REAP_THRESHOLD_MS and recover it. */
export async function sweepStuckRuns(logger: Logger = console): Promise<RunReaperResult> {
  const db = createServiceClient();
  const result: RunReaperResult = { checked: 0, reaped: 0, gaveUp: 0, skipped: 0 };

  const threshold = new Date(Date.now() - REAP_THRESHOLD_MS).toISOString();
  const { data: stuckRaw, error: stuckError } = await (db as any)
    .from("runs")
    .select("id, program_id, user_id, trigger_payload, triggered_by, started_at, reap_attempts")
    .eq("status", "running")
    .lt("started_at", threshold);

  if (stuckError) throw new Error(`Run reaper DB error: ${stuckError.message}`);

  const stuck = (stuckRaw ?? []) as StuckRun[];
  result.checked = stuck.length;
  if (stuck.length === 0) return result;

  const userIds = [...new Set(stuck.map((r) => r.user_id).filter((id): id is string => Boolean(id)))];
  const { data: profilesRaw } = userIds.length > 0
    ? await (db as any).from("profiles").select("id, tier").in("id", userIds)
    : { data: [] };
  const tierByUserId = new Map(
    ((profilesRaw ?? []) as Array<{ id: string; tier: string | null }>).map((p) => [p.id, p.tier ?? "free"])
  );
  const isPriority = (run: StuckRun) => PRIORITY_TIERS.has(tierByUserId.get(run.user_id ?? "") ?? "free");

  const ordered = [...stuck].sort((a, b) => Number(isPriority(b)) - Number(isPriority(a)));

  for (const run of ordered) {
    const giveUp = run.reap_attempts + 1 > MAX_REAP_ATTEMPTS;

    if (!(await claimStuckRun(db, run, giveUp))) {
      // Either the original process finished it just in time, or another
      // tick already claimed it — nothing to do.
      result.skipped++;
      continue;
    }

    if (giveUp) {
      logger.warn(`Reaper: run ${run.id} exhausted ${MAX_REAP_ATTEMPTS} recovery attempts — marked failed`);
      result.gaveUp++;
      continue;
    }

    if (await redispatchRun(db, run, logger)) {
      result.reaped++;
    } else {
      result.gaveUp++;
    }
  }

  return result;
}
