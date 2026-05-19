-- Public profile fields for user-facing profile pages at /u/[username].

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS is_expert BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- Unique, case-insensitive username index
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Username format: 3–30 chars, alphanumeric + underscores only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format
      CHECK (username IS NULL OR (
        length(username) >= 3 AND
        length(username) <= 30 AND
        username ~ '^[a-zA-Z0-9_]+$'
      ));
  END IF;
END $$;
