-- GDPR Art. 18 processing restriction state.
-- A submitted restriction request must create an immediate, queryable account flag.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS processing_restricted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processing_restricted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_restriction_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_processing_restricted
  ON public.profiles (processing_restricted, processing_restricted_at)
  WHERE processing_restricted = TRUE;
