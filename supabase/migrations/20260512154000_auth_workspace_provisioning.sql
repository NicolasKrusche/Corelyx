-- Ensure every new auth user receives a profile and an active workspace.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_workspace_id UUID;
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

  SELECT wm.workspace_id INTO v_workspace_id
  FROM public.workspace_memberships wm
  WHERE wm.user_id = NEW.id
  ORDER BY wm.created_at ASC
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    INSERT INTO public.workspaces (name, created_by)
    VALUES ('My Workspace', NEW.id)
    RETURNING id INTO v_workspace_id;

    INSERT INTO public.workspace_memberships (workspace_id, user_id, role, created_by)
    VALUES (v_workspace_id, NEW.id, 'owner', NEW.id)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  END IF;

  UPDATE public.profiles
  SET org_id = v_workspace_id,
      updated_at = NOW()
  WHERE id = NEW.id
    AND org_id IS NULL;

  RETURN NEW;
END;
$$;
