-- Add onboarding columns to the templates table.
-- These support the template gallery UI: difficulty badges, estimated runtime, required connections, and tags.

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS difficulty         text not null default 'easy',
  ADD COLUMN IF NOT EXISTS estimated_runtime  text not null default '< 1 Min',
  ADD COLUMN IF NOT EXISTS required_connections text[] not null default '{}',
  ADD COLUMN IF NOT EXISTS tags               text[] not null default '{}';

-- Check constraint for difficulty values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'templates_difficulty_check'
  ) THEN
    ALTER TABLE public.templates
      ADD CONSTRAINT templates_difficulty_check
      CHECK (difficulty IN ('easy', 'medium', 'hard'));
  END IF;
END $$;
