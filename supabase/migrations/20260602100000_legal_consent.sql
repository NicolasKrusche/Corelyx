-- Migration: Legal consent tracking
-- Adds legal_consented_at and legal_consent_version to profiles.
-- Used to gate app access until users explicitly accept the current ToS + Privacy Policy.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_consented_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legal_consent_version TEXT;
