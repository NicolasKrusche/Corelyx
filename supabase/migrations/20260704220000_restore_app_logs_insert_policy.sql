-- Restore the app_logs INSERT path for authenticated users.
--
-- The immutable-logs hardening (20260529120000) replaced the permissive
-- "own app_logs" FOR ALL policy with a SELECT-only policy. That correctly
-- blocked UPDATE/DELETE tampering, but it also removed INSERT — so every
-- writeAppLog() call made with a user-scoped client has failed RLS (42501)
-- silently since then, dropping all Genesis and API audit events.
--
-- app_logs is meant to be APPEND-only for client roles: users may add their
-- own rows and read them, but never modify or delete them. UPDATE/DELETE
-- remain revoked (and trigger-guarded) by 20260529120000; this only restores
-- the append.

DROP POLICY IF EXISTS "users insert own app_logs" ON public.app_logs;
CREATE POLICY "users insert own app_logs" ON public.app_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
