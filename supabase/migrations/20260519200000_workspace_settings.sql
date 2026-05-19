-- Workspace customization columns: logo, description, and default settings.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT CHECK (description IS NULL OR length(description) <= 300),
  ADD COLUMN IF NOT EXISTS default_program_visibility TEXT NOT NULL DEFAULT 'workspace'
    CHECK (default_program_visibility IN ('workspace', 'restricted')),
  ADD COLUMN IF NOT EXISTS members_can_create_programs BOOLEAN NOT NULL DEFAULT TRUE;
