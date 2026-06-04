-- Migration: usage-analytics opt-out preference (GDPR Art. 21 / transparency).
--
-- The Privacy Policy states users may opt out of aggregated, non-attributable
-- usage statistics used for product improvement. This column backs that promise.
-- Any aggregated product-improvement analytics must exclude profiles where
-- analytics_opt_out = true. Essential operational, security, and billing
-- processing is unaffected.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS analytics_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
