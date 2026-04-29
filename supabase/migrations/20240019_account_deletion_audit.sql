-- Account deletion receipts must survive user/profile cascade deletion.
-- Store only pseudonymous identifiers and cleanup metadata, never raw email.

CREATE TABLE IF NOT EXISTS public.account_deletion_audit (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id                   UUID NOT NULL,
  email_sha256                      TEXT,
  requested_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                      TIMESTAMPTZ,
  status                            TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed')),
  vault_secrets_seen                INTEGER NOT NULL DEFAULT 0,
  vault_secrets_deleted             INTEGER NOT NULL DEFAULT 0,
  stripe_customers_seen             INTEGER NOT NULL DEFAULT 0,
  stripe_subscriptions_cancelled    INTEGER NOT NULL DEFAULT 0,
  resend_contact_deleted            BOOLEAN NOT NULL DEFAULT FALSE,
  auth_user_deleted                 BOOLEAN NOT NULL DEFAULT FALSE,
  errors                            JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_audit_user_created
  ON public.account_deletion_audit (deleted_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_deletion_audit_status_created
  ON public.account_deletion_audit (status, created_at DESC);

ALTER TABLE public.account_deletion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_audit FROM anon, authenticated;
