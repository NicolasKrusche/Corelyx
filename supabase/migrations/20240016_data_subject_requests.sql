-- Data subject request intake and audit trail.
-- Supports GDPR access, rectification, erasure, restriction, portability, and objection requests.

CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id           UUID,
  request_type     TEXT NOT NULL CHECK (
    request_type IN ('access', 'rectification', 'erasure', 'restriction', 'portability', 'objection', 'withdrawal')
  ),
  status           TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'in_review', 'waiting_on_user', 'completed', 'rejected')
  ),
  requester_email  TEXT,
  details          TEXT,
  response_summary TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at           TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_subject_requests_user_submitted
  ON public.data_subject_requests (user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_subject_requests_status_due
  ON public.data_subject_requests (status, due_at ASC)
  WHERE status NOT IN ('completed', 'rejected');

ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own data_subject_requests" ON public.data_subject_requests
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
