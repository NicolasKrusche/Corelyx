-- Ensure templates table has user_id column for user-created templates
-- (from "Save as Template" feature on run detail pages)

-- Add user_id column if it doesn't exist (also check for created_by alias)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.templates ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add fork_count column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'fork_count'
  ) THEN
    ALTER TABLE public.templates ADD COLUMN fork_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Ensure RLS policies cover user-created templates
-- (The existing policies from seed migration should already cover this,
--  but we add explicit policies for user-owned templates)

-- Users can view all templates (public + their own)
DROP POLICY IF EXISTS "Users can view all templates" ON public.templates;
CREATE POLICY "Users can view all templates"
  ON public.templates FOR SELECT
  USING (true);

-- Users can create templates (for "Save as Template" feature)
DROP POLICY IF EXISTS "Users can create own templates" ON public.templates;
CREATE POLICY "Users can create own templates"
  ON public.templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own templates
DROP POLICY IF EXISTS "Users can update own templates" ON public.templates;
CREATE POLICY "Users can update own templates"
  ON public.templates FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own templates
DROP POLICY IF EXISTS "Users can delete own templates" ON public.templates;
CREATE POLICY "Users can delete own templates"
  ON public.templates FOR DELETE
  USING (auth.uid() = user_id);

-- Add parent_run_id to runs table for replay provenance tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'runs' AND column_name = 'parent_run_id'
  ) THEN
    ALTER TABLE public.runs ADD COLUMN parent_run_id UUID REFERENCES public.runs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add triggered_by = 'replay_from_node' support (no schema change needed, just comment)
COMMENT ON COLUMN public.runs.triggered_by IS 'Values: manual, cron, webhook, event, program_output, file_watch, replay, replay_from_node';
