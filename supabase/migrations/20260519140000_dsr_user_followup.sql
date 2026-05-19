-- Stores the user's follow-up message when a DSR is in waiting_on_user state.
-- Kept separate from `details` (the original submission) so admin can distinguish.

ALTER TABLE public.data_subject_requests
  ADD COLUMN IF NOT EXISTS user_followup TEXT;
