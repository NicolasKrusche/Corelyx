-- ─── Workspace environment variables ─────────────────────────────────────────
-- Encrypted key/value pairs scoped to a workspace. Values are stored in the
-- Supabase Vault (via vault_secret_id); this table stores only metadata.
-- Workflows reference them as $env.VARIABLE_NAME at runtime.

CREATE TABLE IF NOT EXISTS public.workspace_env_vars (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  vault_secret_id UUID        NOT NULL,
  created_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Names must be UPPER_SNAKE_CASE and unique within the workspace
  CONSTRAINT workspace_env_vars_name_format CHECK (name ~ '^[A-Z_][A-Z0-9_]*$'),
  CONSTRAINT workspace_env_vars_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT workspace_env_vars_name_unique UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_workspace_env_vars_workspace
  ON public.workspace_env_vars (workspace_id, created_at DESC);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.workspace_env_vars ENABLE ROW LEVEL SECURITY;

-- Workspace members can read variable names (not values — values live in vault)
CREATE POLICY "workspace_env_vars_select" ON public.workspace_env_vars
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_env_vars.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Owner / admin / member can create variables (viewers cannot)
CREATE POLICY "workspace_env_vars_insert" ON public.workspace_env_vars
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_env_vars.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

-- Owner / admin / member can delete variables
CREATE POLICY "workspace_env_vars_delete" ON public.workspace_env_vars
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_env_vars.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

-- Owner / admin / member can update (used for value rotation)
CREATE POLICY "workspace_env_vars_update" ON public.workspace_env_vars
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_env_vars.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );
