-- Platform AI credits
-- included_credits_used_usd: consumed from this month's plan allowance (resets monthly)
-- included_credits_reset_at: tracks when the included pool was last reset
-- purchased_credits_usd: top-up pool that never resets

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS purchased_credits_usd    DECIMAL(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_credits_used_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_credits_reset_at TIMESTAMPTZ   NOT NULL DEFAULT now();

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS purchased_credits_usd    DECIMAL(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_credits_used_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_credits_reset_at TIMESTAMPTZ   NOT NULL DEFAULT now();

-- Audit log for credit top-ups via Stripe
CREATE TABLE IF NOT EXISTS public.credit_purchases (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id             UUID        REFERENCES public.workspaces(id) ON DELETE SET NULL,
  amount_usd               DECIMAL(10,4) NOT NULL,
  stripe_session_id        TEXT        UNIQUE,
  stripe_payment_intent_id TEXT,
  status                   TEXT        NOT NULL DEFAULT 'completed'
                           CHECK (status IN ('pending', 'completed', 'refunded')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_id ON public.credit_purchases(user_id);

ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_purchases"
  ON public.credit_purchases FOR SELECT
  USING (auth.uid() = user_id);
