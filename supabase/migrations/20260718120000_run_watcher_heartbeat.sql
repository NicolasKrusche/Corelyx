-- Liveness signal for runs blocked on a human/device suspend-resume wait
-- (Human Approval gate, agent corelyx.ask_user, desktop file operation).
--
-- The runtime process holding such a wait open touches this column every
-- ~10-30s while it's actively watching for a decision. The run-reaper sweep
-- (apps/web/lib/run-reaper.ts) uses a fresh heartbeat to tell "a process is
-- still watching this paused run" apart from "the process that was watching
-- it died (crash/redeploy) and nothing will ever notice the decision" --
-- the latter is now eligible for the reaper's existing re-dispatch recovery,
-- which the approval-request path (ProgramExecutor._request_step_approval)
-- was made idempotent against, so recovery no longer duplicates a pending
-- question or re-asks a question that was already decided.
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS watcher_heartbeat_at TIMESTAMPTZ;
