-- Stuck-run reaper: track re-dispatch attempts on runs orphaned by a crashed
-- runtime process (status stuck at "running" because the process died before
-- its own try/finally could mark the run completed/failed).
-- reap_attempts caps automatic re-dispatch so a payload that reliably crashes
-- the runtime doesn't retry forever; last_reaped_at is observability only.

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS reap_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (reap_attempts >= 0),
  ADD COLUMN IF NOT EXISTS last_reaped_at TIMESTAMPTZ;
