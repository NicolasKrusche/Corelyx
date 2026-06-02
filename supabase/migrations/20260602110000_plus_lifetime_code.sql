-- Migration: Add plus_lifetime code type for the Solo plan
-- Also relaxes the type constraint to a list that matches current tier naming.

ALTER TABLE public.redemption_codes
  DROP CONSTRAINT IF EXISTS redemption_codes_type_check;

ALTER TABLE public.redemption_codes
  ADD CONSTRAINT redemption_codes_type_check
    CHECK (type IN (
      'plus_lifetime',
      'pro_lifetime',
      'builder_lifetime',
      'unlimited',
      'pro_trial',
      'run_credits'
    ));
