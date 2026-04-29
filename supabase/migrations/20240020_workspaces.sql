-- Workspace and membership model.
-- Workspaces provide a shared account container with per-person roles.

-- Harden this migration for environments that did not apply the initial
-- profile migration cleanly before workspace migrations.
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID,
  display_name  TEXT,
  avatar_url    TEXT,
  tier          TEXT DEFAULT 'free',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id UUID,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bonus_runs INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_beta_tester BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS genesis_uses_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS genesis_month_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_restricted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processing_restricted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_restriction_reason TEXT;

CREATE TABLE IF NOT EXISTS public.workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email         TEXT NOT NULL CHECK (email = lower(trim(email)) AND position('@' IN email) > 1),
  role          TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  invited_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at   TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invitations_open_email
  ON public.workspace_invitations (workspace_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user
  ON public.workspace_memberships (user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace_role
  ON public.workspace_memberships (workspace_id, role);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email_open
  ON public.workspace_invitations (email, created_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace(p_workspace_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
      AND wm.role IN ('owner', 'admin')
  );
$$;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read workspaces" ON public.workspaces
  FOR SELECT USING (public.is_workspace_member(id));

CREATE POLICY "workspace managers update workspaces" ON public.workspaces
  FOR UPDATE USING (public.can_manage_workspace(id))
  WITH CHECK (public.can_manage_workspace(id));

CREATE POLICY "workspace creators insert workspaces" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "workspace members read memberships" ON public.workspace_memberships
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "workspace managers write memberships" ON public.workspace_memberships
  FOR ALL USING (public.can_manage_workspace(workspace_id))
  WITH CHECK (public.can_manage_workspace(workspace_id));

CREATE POLICY "workspace members read invitations" ON public.workspace_invitations
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "workspace managers write invitations" ON public.workspace_invitations
  FOR ALL USING (public.can_manage_workspace(workspace_id))
  WITH CHECK (public.can_manage_workspace(workspace_id));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_memberships (workspace_id, user_id, role, created_by)
  SELECT wi.workspace_id, NEW.id, wi.role, wi.invited_by
  FROM public.workspace_invitations wi
  WHERE wi.email = lower(NEW.email)
    AND wi.accepted_at IS NULL
    AND wi.revoked_at IS NULL
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invitations
  SET accepted_by = NEW.id,
      accepted_at = NOW(),
      updated_at = NOW()
  WHERE email = lower(NEW.email)
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  UPDATE public.profiles
  SET org_id = (
    SELECT wm.workspace_id
    FROM public.workspace_memberships wm
    WHERE wm.user_id = NEW.id
    ORDER BY wm.created_at ASC
    LIMIT 1
  )
  WHERE id = NEW.id
    AND org_id IS NULL;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  profile_row RECORD;
  v_workspace_id UUID;
  workspace_name TEXT;
BEGIN
  FOR profile_row IN SELECT id, org_id, display_name FROM public.profiles LOOP
    v_workspace_id := COALESCE(profile_row.org_id, gen_random_uuid());
    workspace_name := CASE
      WHEN NULLIF(trim(profile_row.display_name), '') IS NULL THEN 'My Workspace'
      ELSE trim(profile_row.display_name) || '''s Workspace'
    END;

    INSERT INTO public.workspaces (id, name, created_by)
    VALUES (v_workspace_id, workspace_name, profile_row.id)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.workspace_memberships (workspace_id, user_id, role, created_by)
    VALUES (v_workspace_id, profile_row.id, 'owner', profile_row.id)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    UPDATE public.profiles
    SET org_id = v_workspace_id
    WHERE id = profile_row.id
      AND org_id IS NULL;
  END LOOP;
END $$;
