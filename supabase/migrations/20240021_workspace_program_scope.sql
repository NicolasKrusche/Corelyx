-- Workspace scope for programs, connections, api_keys + per-program ACL.
-- Goal: programs/connections/api_keys belong to a workspace, every workspace
-- member sees them according to their role; per-program overrides allow
-- granting elevated or reduced access at the program level.

-- ─── Add workspace_id columns ──────────────────────────────────────────────

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace'
    CHECK (visibility IN ('workspace', 'restricted'));

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- ─── Backfill workspace_id from creator's active workspace ────────────────

UPDATE public.programs p
SET workspace_id = pr.org_id
FROM public.profiles pr
WHERE p.workspace_id IS NULL
  AND pr.id = p.user_id
  AND pr.org_id IS NOT NULL;

UPDATE public.connections c
SET workspace_id = pr.org_id
FROM public.profiles pr
WHERE c.workspace_id IS NULL
  AND pr.id = c.user_id
  AND pr.org_id IS NOT NULL;

UPDATE public.api_keys k
SET workspace_id = pr.org_id
FROM public.profiles pr
WHERE k.workspace_id IS NULL
  AND pr.id = k.user_id
  AND pr.org_id IS NOT NULL;

-- For any rows where the creator had no org_id (shouldn't happen after 20240020,
-- but harden anyway) create a default workspace and assign.
DO $$
DECLARE
  row RECORD;
  v_workspace_id UUID;
BEGIN
  FOR row IN
    SELECT DISTINCT user_id FROM public.programs WHERE workspace_id IS NULL
    UNION
    SELECT DISTINCT user_id FROM public.connections WHERE workspace_id IS NULL
    UNION
    SELECT DISTINCT user_id FROM public.api_keys WHERE workspace_id IS NULL
  LOOP
    SELECT workspace_id INTO v_workspace_id
    FROM public.workspace_memberships
    WHERE user_id = row.user_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_workspace_id IS NULL THEN
      INSERT INTO public.workspaces (name, created_by)
      VALUES ('My Workspace', row.user_id)
      RETURNING id INTO v_workspace_id;

      INSERT INTO public.workspace_memberships (workspace_id, user_id, role, created_by)
      VALUES (v_workspace_id, row.user_id, 'owner', row.user_id)
      ON CONFLICT DO NOTHING;

      UPDATE public.profiles SET org_id = v_workspace_id
      WHERE id = row.user_id AND org_id IS NULL;
    END IF;

    UPDATE public.programs SET workspace_id = v_workspace_id
      WHERE workspace_id IS NULL AND user_id = row.user_id;
    UPDATE public.connections SET workspace_id = v_workspace_id
      WHERE workspace_id IS NULL AND user_id = row.user_id;
    UPDATE public.api_keys SET workspace_id = v_workspace_id
      WHERE workspace_id IS NULL AND user_id = row.user_id;
  END LOOP;
END $$;

ALTER TABLE public.programs    ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.connections ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.api_keys    ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_programs_workspace    ON public.programs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connections_workspace ON public.connections (workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_workspace    ON public.api_keys (workspace_id);

-- ─── Per-program ACL ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.program_memberships (
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('editor', 'runner', 'viewer')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_program_memberships_user
  ON public.program_memberships (user_id, program_id);

ALTER TABLE public.program_memberships ENABLE ROW LEVEL SECURITY;

-- ─── Access helpers ───────────────────────────────────────────────────────

-- Returns the effective program role for a user, or NULL if no access.
-- Roles: 'editor' | 'runner' | 'viewer'.
CREATE OR REPLACE FUNCTION public.program_access_role(
  p_program_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_visibility TEXT;
  v_workspace_role TEXT;
  v_program_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT workspace_id, visibility
    INTO v_workspace_id, v_visibility
  FROM public.programs
  WHERE id = p_program_id;

  IF v_workspace_id IS NULL THEN RETURN NULL; END IF;

  SELECT role INTO v_workspace_role
  FROM public.workspace_memberships
  WHERE workspace_id = v_workspace_id AND user_id = p_user_id;

  IF v_workspace_role IS NULL THEN RETURN NULL; END IF;

  -- Workspace owner/admin always have full edit access.
  IF v_workspace_role IN ('owner', 'admin') THEN RETURN 'editor'; END IF;

  -- Per-program override wins for non-managers.
  SELECT role INTO v_program_role
  FROM public.program_memberships
  WHERE program_id = p_program_id AND user_id = p_user_id;

  IF v_program_role IS NOT NULL THEN RETURN v_program_role; END IF;

  -- No override; fall back to workspace defaults if visibility allows it.
  IF v_visibility = 'restricted' THEN RETURN NULL; END IF;

  RETURN CASE v_workspace_role
    WHEN 'member' THEN 'runner'
    WHEN 'viewer' THEN 'viewer'
    ELSE NULL
  END;
END;
$$;

-- Convenience predicates used throughout RLS.
CREATE OR REPLACE FUNCTION public.can_view_program(p_program_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.program_access_role(p_program_id, p_user_id) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.can_run_program(p_program_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.program_access_role(p_program_id, p_user_id) IN ('editor', 'runner');
$$;

CREATE OR REPLACE FUNCTION public.can_edit_program(p_program_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.program_access_role(p_program_id, p_user_id) = 'editor';
$$;

-- A workspace member who is *not* a viewer.
CREATE OR REPLACE FUNCTION public.is_workspace_contributor(
  p_workspace_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
      AND role IN ('owner', 'admin', 'member')
  );
$$;

-- ─── Replace user-scoped RLS with workspace-scoped RLS ─────────────────────

-- Programs
DROP POLICY IF EXISTS "own programs" ON public.programs;
DROP POLICY IF EXISTS "Users see own programs" ON public.programs;
DROP POLICY IF EXISTS "Users insert own programs" ON public.programs;
DROP POLICY IF EXISTS "Users update own programs" ON public.programs;
DROP POLICY IF EXISTS "Users delete own programs" ON public.programs;

CREATE POLICY "members read programs" ON public.programs
  FOR SELECT USING (public.can_view_program(id));

CREATE POLICY "contributors create programs" ON public.programs
  FOR INSERT WITH CHECK (
    public.is_workspace_contributor(workspace_id)
  );

CREATE POLICY "editors update programs" ON public.programs
  FOR UPDATE USING (public.can_edit_program(id))
  WITH CHECK (public.can_edit_program(id));

CREATE POLICY "editors delete programs" ON public.programs
  FOR DELETE USING (public.can_edit_program(id));

-- program_memberships
CREATE POLICY "members read program_memberships" ON public.program_memberships
  FOR SELECT USING (public.can_view_program(program_id));

CREATE POLICY "editors manage program_memberships" ON public.program_memberships
  FOR ALL USING (public.can_edit_program(program_id))
  WITH CHECK (public.can_edit_program(program_id));

-- Connections (workspace-scoped: every member can read, contributor can write).
DROP POLICY IF EXISTS "own connections" ON public.connections;
DROP POLICY IF EXISTS "Users see own connections" ON public.connections;
DROP POLICY IF EXISTS "Users insert own connections" ON public.connections;
DROP POLICY IF EXISTS "Users update own connections" ON public.connections;
DROP POLICY IF EXISTS "Users delete own connections" ON public.connections;

CREATE POLICY "members read connections" ON public.connections
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "contributors write connections" ON public.connections
  FOR ALL USING (public.is_workspace_contributor(workspace_id))
  WITH CHECK (public.is_workspace_contributor(workspace_id));

-- API keys
DROP POLICY IF EXISTS "own api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users see own api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users insert own api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users update own api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users delete own api_keys" ON public.api_keys;

CREATE POLICY "members read api_keys" ON public.api_keys
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "contributors write api_keys" ON public.api_keys
  FOR ALL USING (public.is_workspace_contributor(workspace_id))
  WITH CHECK (public.is_workspace_contributor(workspace_id));

-- Programs' children inherit access via program_id.
-- (program_versions, runs, node_executions, approvals, triggers, etc.)
-- Most use the service-role client server-side, so RLS already bypassed.
-- These policies harden direct client access if anyone ever switches.

DROP POLICY IF EXISTS "own program_versions" ON public.program_versions;
CREATE POLICY "members read program_versions" ON public.program_versions
  FOR SELECT USING (public.can_view_program(program_id));
CREATE POLICY "editors write program_versions" ON public.program_versions
  FOR ALL USING (public.can_edit_program(program_id))
  WITH CHECK (public.can_edit_program(program_id));

DROP POLICY IF EXISTS "own program_connections" ON public.program_connections;
CREATE POLICY "members read program_connections" ON public.program_connections
  FOR SELECT USING (public.can_view_program(program_id));
CREATE POLICY "editors write program_connections" ON public.program_connections
  FOR ALL USING (public.can_edit_program(program_id))
  WITH CHECK (public.can_edit_program(program_id));

DROP POLICY IF EXISTS "own runs" ON public.runs;
CREATE POLICY "members read runs" ON public.runs
  FOR SELECT USING (public.can_view_program(program_id));
CREATE POLICY "runners create runs" ON public.runs
  FOR INSERT WITH CHECK (public.can_run_program(program_id));
CREATE POLICY "runners update own runs" ON public.runs
  FOR UPDATE USING (public.can_run_program(program_id))
  WITH CHECK (public.can_run_program(program_id));

DROP POLICY IF EXISTS "own triggers" ON public.triggers;
CREATE POLICY "members read triggers" ON public.triggers
  FOR SELECT USING (public.can_view_program(program_id));
CREATE POLICY "editors write triggers" ON public.triggers
  FOR ALL USING (public.can_edit_program(program_id))
  WITH CHECK (public.can_edit_program(program_id));
