-- Atomic credit deduction function.
-- Caller pre-computes how much to drain from each pool.
-- Returns TRUE if the update succeeded without going negative, FALSE otherwise.
CREATE OR REPLACE FUNCTION public.deduct_user_credits_raw(
  p_user_id            UUID,
  p_add_to_included    DECIMAL(10,6),
  p_sub_from_purchased DECIMAL(10,6)
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchased DECIMAL(10,6);
BEGIN
  SELECT purchased_credits_usd
  INTO v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_purchased < p_sub_from_purchased THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles
  SET
    included_credits_used_usd = included_credits_used_usd + p_add_to_included,
    purchased_credits_usd     = purchased_credits_usd - p_sub_from_purchased
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

-- Atomic top-up (safe increment on purchased pool).
CREATE OR REPLACE FUNCTION public.top_up_user_credits(
  p_user_id    UUID,
  p_amount_usd DECIMAL(10,6)
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET purchased_credits_usd = purchased_credits_usd + p_amount_usd
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_user_credits_raw(UUID, DECIMAL, DECIMAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.top_up_user_credits(UUID, DECIMAL) FROM PUBLIC;
