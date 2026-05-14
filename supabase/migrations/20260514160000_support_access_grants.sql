-- Per-program support access grants.
-- Users choose which programs to share with support on a per-ticket basis.
-- Grants expire after 7 days and can be revoked at any time.

CREATE TABLE IF NOT EXISTS public.support_access_grants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  program_id  UUID        NOT NULL REFERENCES public.programs(id)    ON DELETE CASCADE,
  ticket_id   UUID        REFERENCES public.support_tickets(id)      ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, program_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_support_access_grants_user    ON public.support_access_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_support_access_grants_ticket  ON public.support_access_grants(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_access_grants_program ON public.support_access_grants(program_id);

ALTER TABLE public.support_access_grants ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own grants
CREATE POLICY "users_manage_own_grants"
  ON public.support_access_grants
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
