-- Threaded message history for data subject requests.
-- Replaces the single response_summary / user_followup fields for display purposes
-- (those columns are kept for backwards compat and admin queue filtering).

CREATE TABLE IF NOT EXISTS public.dsr_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dsr_id      UUID NOT NULL REFERENCES public.data_subject_requests(id) ON DELETE CASCADE,
  sender      TEXT NOT NULL CHECK (sender IN ('user', 'admin')),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dsr_messages_dsr_created
  ON public.dsr_messages (dsr_id, created_at ASC);

ALTER TABLE public.dsr_messages ENABLE ROW LEVEL SECURITY;

-- Users can only read messages belonging to their own DSRs.
CREATE POLICY "dsr_messages_read_own" ON public.dsr_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.data_subject_requests dsr
      WHERE dsr.id = dsr_id AND dsr.user_id = auth.uid()
    )
  );
