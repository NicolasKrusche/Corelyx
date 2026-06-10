-- Fix workspace_env_vars RLS policies that incorrectly referenced
-- public.workspace_members (which does not exist) instead of the
-- correct public.workspace_memberships table. All four policies are
-- dropped and recreated with the right table name.

DROP POLICY IF EXISTS "workspace_env_vars_select" ON public.workspace_env_vars;
DROP POLICY IF EXISTS "workspace_env_vars_insert" ON public.workspace_env_vars;
DROP POLICY IF EXISTS "workspace_env_vars_delete" ON public.workspace_env_vars;
DROP POLICY IF EXISTS "workspace_env_vars_update" ON public.workspace_env_vars;

CREATE POLICY "workspace_env_vars_select" ON public.workspace_env_vars
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_env_vars.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_env_vars_insert" ON public.workspace_env_vars
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_env_vars.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "workspace_env_vars_delete" ON public.workspace_env_vars
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_env_vars.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "workspace_env_vars_update" ON public.workspace_env_vars
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspace_env_vars.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );
