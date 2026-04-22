-- App-level logs for activity that is not tied to a runtime run yet.
-- Genesis generation can fail before a program or run exists, so those events
-- need their own log stream.

CREATE TABLE IF NOT EXISTS public.app_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id      UUID,
  program_id  UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  run_id      UUID REFERENCES public.runs(id) ON DELETE SET NULL,
  level       TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  source      TEXT NOT NULL,
  event       TEXT NOT NULL,
  status      TEXT NOT NULL,
  message     TEXT NOT NULL,
  details     JSONB,
  duration_ms INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_user_created
  ON public.app_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_logs_program_created
  ON public.app_logs (program_id, created_at DESC)
  WHERE program_id IS NOT NULL;

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own app_logs" ON public.app_logs
  FOR ALL USING (auth.uid() = user_id);
