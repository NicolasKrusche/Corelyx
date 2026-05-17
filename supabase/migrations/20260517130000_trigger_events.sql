-- Trigger event log: records every time a trigger fires (or is skipped/fails).
-- Lets users see a history of when each trigger ran without scanning the full
-- runs table.

CREATE TABLE IF NOT EXISTS public.trigger_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID        REFERENCES public.triggers(id) ON DELETE CASCADE,
  program_id UUID        NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  run_id     UUID        REFERENCES public.runs(id) ON DELETE SET NULL,
  fired_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source     TEXT        NOT NULL,  -- cron | webhook | program | event | manual
  status     TEXT        NOT NULL   -- dispatched | skipped | failed
             CHECK (status IN ('dispatched', 'skipped', 'failed')),
  message    TEXT                   -- error or skip reason (null on success)
);

CREATE INDEX IF NOT EXISTS idx_trigger_events_program_fired
  ON public.trigger_events (program_id, fired_at DESC);

CREATE INDEX IF NOT EXISTS idx_trigger_events_trigger_fired
  ON public.trigger_events (trigger_id, fired_at DESC);

-- Auto-clean events older than 90 days to keep the table lean.
-- The data-retention Inngest job will handle this; this comment is the contract.

ALTER TABLE public.trigger_events ENABLE ROW LEVEL SECURITY;

-- Users can only read their own programs' trigger events.
CREATE POLICY "own trigger_events" ON public.trigger_events
  FOR SELECT USING (
    program_id IN (
      SELECT id FROM public.programs WHERE user_id = auth.uid()
    )
  );

-- Inserts are done via service role only (server-side).
REVOKE INSERT, UPDATE, DELETE ON public.trigger_events FROM authenticated, anon;
