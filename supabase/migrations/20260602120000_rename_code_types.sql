-- Migration: Rename redemption code types to match current plan names.
-- plus_lifetime → solo_lifetime
-- pro_lifetime  → team_lifetime
-- builder_lifetime → scale_lifetime
-- pro_trial     → team_trial
-- plus_trial    → solo_trial  (was in RPC but not formally in constraint)
-- unlimited / run_credits unchanged

-- 1. Migrate existing rows
UPDATE public.redemption_codes SET type = 'solo_lifetime'  WHERE type = 'plus_lifetime';
UPDATE public.redemption_codes SET type = 'team_lifetime'  WHERE type = 'pro_lifetime';
UPDATE public.redemption_codes SET type = 'scale_lifetime' WHERE type = 'builder_lifetime';
UPDATE public.redemption_codes SET type = 'team_trial'     WHERE type = 'pro_trial';
UPDATE public.redemption_codes SET type = 'solo_trial'     WHERE type = 'plus_trial';

-- 2. Replace the CHECK constraint
ALTER TABLE public.redemption_codes
  DROP CONSTRAINT IF EXISTS redemption_codes_type_check;

ALTER TABLE public.redemption_codes
  ADD CONSTRAINT redemption_codes_type_check
    CHECK (type IN (
      'solo_lifetime',
      'team_lifetime',
      'scale_lifetime',
      'unlimited',
      'solo_trial',
      'team_trial',
      'run_credits'
    ));

-- 3. Update the redemption RPC to use new type names and benefit strings
CREATE OR REPLACE FUNCTION public.redeem_code_atomic(
  p_code TEXT,
  p_user_id UUID,
  p_workspace_id UUID,
  p_user_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code public.redemption_codes%ROWTYPE;
  v_days INTEGER;
  v_runs INTEGER;
  v_benefit TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'CODE_NOT_REDEEMABLE';
  END IF;

  SELECT *
  INTO v_code
  FROM public.redemption_codes
  WHERE code = upper(trim(p_code))
    AND is_active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CODE_NOT_REDEEMABLE';
  END IF;

  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < NOW() THEN
    RAISE EXCEPTION 'CODE_NOT_REDEEMABLE';
  END IF;

  IF v_code.max_uses IS NOT NULL AND v_code.uses_count >= v_code.max_uses THEN
    RAISE EXCEPTION 'CODE_NOT_REDEEMABLE';
  END IF;

  IF v_code.locked_to_email IS NOT NULL
    AND lower(v_code.locked_to_email) <> lower(COALESCE(p_user_email, ''))
  THEN
    RAISE EXCEPTION 'CODE_NOT_REDEEMABLE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.redemptions r
    WHERE r.code_id = v_code.id
      AND r.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'CODE_NOT_REDEEMABLE';
  END IF;

  CASE v_code.type
    WHEN 'solo_lifetime' THEN
      UPDATE public.workspaces
      SET tier = 'plus',
          plan_expires_at = NULL,
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := 'Solo plan (lifetime)';

    WHEN 'solo_trial' THEN
      v_days := COALESCE((v_code.value->>'days')::INTEGER, 30);
      UPDATE public.workspaces
      SET tier = 'plus',
          plan_expires_at = NOW() + make_interval(days => v_days),
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := format('Solo plan for %s days', v_days);

    WHEN 'team_lifetime' THEN
      UPDATE public.workspaces
      SET tier = 'pro',
          plan_expires_at = NULL,
          is_beta_tester = CASE
            WHEN v_code.label IS NOT NULL AND lower(v_code.label) LIKE '%beta%' THEN TRUE
            ELSE is_beta_tester
          END,
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := 'Team plan (lifetime)';

    WHEN 'team_trial' THEN
      v_days := COALESCE((v_code.value->>'days')::INTEGER, 30);
      UPDATE public.workspaces
      SET tier = 'pro',
          plan_expires_at = NOW() + make_interval(days => v_days),
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := format('Team plan for %s days', v_days);

    WHEN 'scale_lifetime' THEN
      UPDATE public.workspaces
      SET tier = 'builder',
          plan_expires_at = NULL,
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := 'Scale plan (lifetime)';

    WHEN 'unlimited' THEN
      UPDATE public.workspaces
      SET tier = 'unlimited',
          plan_expires_at = NULL,
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := 'Unlimited plan (lifetime)';

    WHEN 'run_credits' THEN
      v_runs := COALESCE((v_code.value->>'runs')::INTEGER, 100);
      UPDATE public.workspaces
      SET bonus_runs = bonus_runs + v_runs,
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := format('%s bonus runs added', v_runs);

    ELSE
      RAISE EXCEPTION 'CODE_NOT_REDEEMABLE';
  END CASE;

  INSERT INTO public.redemptions (code_id, user_id)
  VALUES (v_code.id, p_user_id);

  UPDATE public.redemption_codes
  SET uses_count = uses_count + 1
  WHERE id = v_code.id;

  RETURN jsonb_build_object('success', TRUE, 'benefit', v_benefit);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'CODE_NOT_REDEEMABLE';
END;
$$;
