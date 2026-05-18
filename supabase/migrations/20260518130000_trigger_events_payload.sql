-- Add optional payload column to trigger_events so webhook trigger events
-- can store the incoming request body for inspection in the UI.

ALTER TABLE public.trigger_events
  ADD COLUMN IF NOT EXISTS payload JSONB NULL;

COMMENT ON COLUMN public.trigger_events.payload IS
  'Optional raw payload captured at trigger fire time (e.g. the inbound webhook JSON body).';
