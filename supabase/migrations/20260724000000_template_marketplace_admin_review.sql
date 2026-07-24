-- Template Marketplace v1: Add admin review status columns
-- Enables the admin review queue for user-submitted templates.

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS status          text not null default 'approved',
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Check constraint for status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'templates_status_check'
  ) THEN
    ALTER TABLE public.templates
      ADD CONSTRAINT templates_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- Admin policies: admins can update any template (approve/reject)
-- Only users with admin profiles can manage the review queue.
-- The existing RLS policies allow authenticated users to read all templates;
-- admin-level write access is handled at the API route level via isAdminEmail.
