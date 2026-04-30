-- Safety hardening: atomic redemption and distributed rate limiting.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at
  ON public.rate_limit_buckets (reset_at);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_row public.rate_limit_buckets%ROWTYPE;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'rate limit key is required';
  END IF;
  IF p_limit <= 0 OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'rate limit bounds must be positive';
  END IF;

  INSERT INTO public.rate_limit_buckets (key, count, reset_at, updated_at)
  VALUES (p_key, 1, v_now + make_interval(secs => p_window_seconds), v_now)
  ON CONFLICT (key) DO UPDATE
  SET count = CASE
        WHEN public.rate_limit_buckets.reset_at <= v_now THEN 1
        ELSE public.rate_limit_buckets.count + 1
      END,
      reset_at = CASE
        WHEN public.rate_limit_buckets.reset_at <= v_now
          THEN v_now + make_interval(secs => p_window_seconds)
        ELSE public.rate_limit_buckets.reset_at
      END,
      updated_at = v_now
  RETURNING * INTO v_row;

  RETURN v_row.count <= p_limit;
END;
$$;

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
    WHEN 'plus_lifetime' THEN
      UPDATE public.workspaces
      SET tier = 'plus',
          plan_expires_at = NULL,
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := 'Solo plan (lifetime)';

    WHEN 'plus_trial' THEN
      v_days := COALESCE((v_code.value->>'days')::INTEGER, 30);
      UPDATE public.workspaces
      SET tier = 'plus',
          plan_expires_at = NOW() + make_interval(days => v_days),
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := format('Solo plan for %s days', v_days);

    WHEN 'pro_lifetime' THEN
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

    WHEN 'builder_lifetime' THEN
      UPDATE public.workspaces
      SET tier = 'builder',
          plan_expires_at = NULL,
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := 'Builder plan (lifetime)';

    WHEN 'unlimited' THEN
      UPDATE public.workspaces
      SET tier = 'unlimited',
          plan_expires_at = NULL,
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := 'Unlimited plan (lifetime)';

    WHEN 'pro_trial' THEN
      v_days := COALESCE((v_code.value->>'days')::INTEGER, 30);
      UPDATE public.workspaces
      SET tier = 'pro',
          plan_expires_at = NOW() + make_interval(days => v_days),
          updated_at = NOW()
      WHERE id = p_workspace_id;
      v_benefit := format('Pro plan for %s days', v_days);

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
