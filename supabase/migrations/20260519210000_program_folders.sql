-- Program folders: organise programs into named groups within a workspace.

CREATE TABLE IF NOT EXISTS public.workspace_folders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  color        TEXT,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.workspace_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_folders_workspace ON public.workspace_folders (workspace_id);
CREATE INDEX IF NOT EXISTS idx_programs_folder ON public.programs (folder_id) WHERE folder_id IS NOT NULL;

ALTER TABLE public.workspace_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read folders" ON public.workspace_folders
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "workspace managers write folders" ON public.workspace_folders
  FOR ALL USING (public.can_manage_workspace(workspace_id))
  WITH CHECK (public.can_manage_workspace(workspace_id));
