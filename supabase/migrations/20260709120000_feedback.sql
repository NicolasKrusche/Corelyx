-- Lightweight in-app user feedback (bug reports / feature ideas), separate
-- from the formal support_tickets flow. No threading — just a message an
-- admin triages and moves through a status.

CREATE TABLE IF NOT EXISTS public.feedback (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email  TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'idea'
              CHECK (type IN ('bug', 'idea', 'other')),
  message     TEXT        NOT NULL,
  page_path   TEXT,
  status      TEXT        NOT NULL DEFAULT 'new'
              CHECK (status IN ('new', 'planned', 'in_progress', 'done', 'declined')),
  admin_notes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id    ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status      ON public.feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at  ON public.feedback(created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_feedback"
  ON public.feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_feedback"
  ON public.feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);
-- Service role (used by API routes) bypasses RLS for admin operations.
