-- Convert user-facing platform AI balances from USD-denominated decimals to
-- integer credits. 1 USD of the previous balance is equivalent to 1,000 credits.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS purchased_credits BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_credits_used BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS purchased_credits BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_credits_used BIGINT NOT NULL DEFAULT 0;

UPDATE public.profiles
SET purchased_credits = ROUND(purchased_credits_usd * 1000),
    included_credits_used = ROUND(included_credits_used_usd * 1000);

UPDATE public.workspaces
SET purchased_credits = ROUND(purchased_credits_usd * 1000),
    included_credits_used = ROUND(included_credits_used_usd * 1000);

ALTER TABLE public.credit_purchases
  RENAME COLUMN amount_usd TO price_usd;

ALTER TABLE public.credit_purchases
  ADD COLUMN IF NOT EXISTS amount_credits BIGINT;

UPDATE public.credit_purchases
SET amount_credits = ROUND(price_usd * 1000)
WHERE amount_credits IS NULL;

ALTER TABLE public.credit_purchases
  ALTER COLUMN amount_credits SET NOT NULL;

ALTER TABLE public.auto_recharge_configs
  ADD COLUMN IF NOT EXISTS threshold_credits BIGINT,
  ADD COLUMN IF NOT EXISTS recharge_credits BIGINT;

UPDATE public.auto_recharge_configs
SET threshold_credits = ROUND(threshold_usd * 1000),
    recharge_credits = ROUND(recharge_amount_usd * 1000)
WHERE threshold_credits IS NULL
   OR recharge_credits IS NULL;

ALTER TABLE public.auto_recharge_configs
  ALTER COLUMN threshold_credits SET DEFAULT 2000,
  ALTER COLUMN threshold_credits SET NOT NULL,
  ALTER COLUMN recharge_credits SET DEFAULT 10000,
  ALTER COLUMN recharge_credits SET NOT NULL;

DROP FUNCTION IF EXISTS public.deduct_user_credits_raw(UUID, DECIMAL, DECIMAL);
DROP FUNCTION IF EXISTS public.top_up_user_credits(UUID, DECIMAL);

CREATE OR REPLACE FUNCTION public.deduct_user_credits_raw(
  p_user_id             UUID,
  p_add_to_included     BIGINT,
  p_sub_from_purchased  BIGINT,
  p_included_limit      BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_included_used BIGINT;
  v_purchased     BIGINT;
BEGIN
  IF p_add_to_included < 0
     OR p_sub_from_purchased < 0
     OR p_included_limit < 0 THEN
    RETURN FALSE;
  END IF;

  SELECT included_credits_used, purchased_credits
  INTO v_included_used, v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_included_used + p_add_to_included > p_included_limit
     OR v_purchased < p_sub_from_purchased THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles
  SET included_credits_used = included_credits_used + p_add_to_included,
      purchased_credits = purchased_credits - p_sub_from_purchased
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.top_up_user_credits(
  p_user_id        UUID,
  p_amount_credits BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount_credits <= 0 THEN
    RAISE EXCEPTION 'Credit top-up must be positive';
  END IF;

  UPDATE public.profiles
  SET purchased_credits = purchased_credits + p_amount_credits
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_credit_purchase(
  p_user_id                  UUID,
  p_amount_credits           BIGINT,
  p_price_usd                DECIMAL(10,4),
  p_stripe_session_id        TEXT,
  p_stripe_payment_intent_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount_credits <= 0 OR p_price_usd <= 0 OR p_stripe_session_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.credit_purchases (
    user_id,
    amount_credits,
    price_usd,
    stripe_session_id,
    stripe_payment_intent_id,
    status
  ) VALUES (
    p_user_id,
    p_amount_credits,
    p_price_usd,
    p_stripe_session_id,
    p_stripe_payment_intent_id,
    'completed'
  )
  ON CONFLICT (stripe_session_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles
  SET purchased_credits = purchased_credits + p_amount_credits
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit purchase profile does not exist';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_user_credits_raw(UUID, BIGINT, BIGINT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.top_up_user_credits(UUID, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_credit_purchase(UUID, BIGINT, DECIMAL, TEXT, TEXT) FROM PUBLIC;

ALTER TABLE public.profiles
  DROP COLUMN purchased_credits_usd,
  DROP COLUMN included_credits_used_usd;

ALTER TABLE public.workspaces
  DROP COLUMN purchased_credits_usd,
  DROP COLUMN included_credits_used_usd;

ALTER TABLE public.auto_recharge_configs
  DROP COLUMN threshold_usd,
  DROP COLUMN recharge_amount_usd;
