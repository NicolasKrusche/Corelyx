-- Repair schema drift that silently broke cron trigger dispatch.
--
-- The live database is missing two columns that exist in earlier migration
-- files but were never applied to this project:
--
--   1. runs.execution_mode (from 20240003_phase4.sql) — the cron sweep inserts
--      this on every scheduled run, so PostgREST rejected the run row and every
--      cron firing became a silent no-op (trigger claimed, next_run_at
--      advanced, no run created).
--
--   2. trigger_events.payload (from 20260518130000_trigger_events_payload.sql)
--      — recordTriggerEvent referenced it on every insert, so the audit trail
--      that would have exposed #1 never wrote a single row.
--
--   3. runs.reap_attempts / runs.last_reaped_at (from 20260708140000_run_reaper.sql)
--      — the stuck-run reaper that shares the cron tick endpoint errors on
--      every tick without them (isolated, so it never blocked cron itself).
--
-- All statements are idempotent and safe to run on a database that already
-- has the columns.

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'autonomous';

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS reap_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (reap_attempts >= 0),
  ADD COLUMN IF NOT EXISTS last_reaped_at TIMESTAMPTZ;

ALTER TABLE public.trigger_events
  ADD COLUMN IF NOT EXISTS payload JSONB NULL;

COMMENT ON COLUMN public.trigger_events.payload IS
  'Optional raw payload captured at trigger fire time (e.g. the inbound webhook JSON body).';
