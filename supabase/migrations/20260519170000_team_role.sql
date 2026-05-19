-- Team role for Corelyx staff — shown as a second badge on public profiles.
-- Set manually in Supabase for team members (is_admin = true).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS team_role TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_team_role_values'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_team_role_values
      CHECK (team_role IS NULL OR team_role IN ('founder', 'dev', 'support', 'marketing'));
  END IF;
END $$;
