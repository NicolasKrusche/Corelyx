-- Governance hardening: app_logs are the append-only audit trail for
-- governance events that are not solely captured by runs/node_executions.
--
-- Immutability goals:
--   * Client-facing roles (anon, authenticated) may read their own rows but may
--     never modify or delete audit evidence.
--   * The evidentiary content of a row (who/what/when) can never be edited in
--     place, even by privileged server code.
--
-- Non-goals (must keep working):
--   * GDPR Art. 17 erasure / account deletion. Deleting an auth user cascades
--     auth.users -> profiles -> app_logs (ON DELETE CASCADE). A BEFORE DELETE
--     guard would abort that cascade and silently break account deletion.
--   * Program / run deletion. app_logs.program_id and app_logs.run_id are
--     ON DELETE SET NULL, which performs an UPDATE on app_logs. A blanket
--     BEFORE UPDATE guard would abort program/run deletion too.
--
-- We therefore enforce immutability with REVOKE (for client roles) plus a
-- column-scoped UPDATE guard that only rejects edits to evidentiary columns,
-- while allowing FK housekeeping (program_id/run_id -> NULL) and cascade DELETE.

DROP POLICY IF EXISTS "own app_logs" ON public.app_logs;

CREATE POLICY "users read own app_logs" ON public.app_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Block direct tampering by client-facing roles at the grant level. This does
-- not affect service-role writes or FK referential actions run by the owner.
REVOKE UPDATE, DELETE ON public.app_logs FROM anon, authenticated;

-- Reject in-place edits to evidentiary columns for ANY role. UPDATEs that only
-- touch FK linkage columns (program_id, run_id) are allowed so ON DELETE SET
-- NULL housekeeping does not break program/run deletion. DELETE is intentionally
-- NOT guarded here so cascade erasure keeps working.
CREATE OR REPLACE FUNCTION public.prevent_app_logs_tamper()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.id          IS DISTINCT FROM OLD.id          OR
    NEW.user_id     IS DISTINCT FROM OLD.user_id     OR
    NEW.org_id      IS DISTINCT FROM OLD.org_id      OR
    NEW.level       IS DISTINCT FROM OLD.level       OR
    NEW.source      IS DISTINCT FROM OLD.source      OR
    NEW.event       IS DISTINCT FROM OLD.event       OR
    NEW.status      IS DISTINCT FROM OLD.status      OR
    NEW.message     IS DISTINCT FROM OLD.message     OR
    NEW.details     IS DISTINCT FROM OLD.details     OR
    NEW.duration_ms IS DISTINCT FROM OLD.duration_ms OR
    NEW.created_at  IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'app_logs evidentiary columns are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_app_logs_mutation ON public.app_logs;
DROP TRIGGER IF EXISTS trg_prevent_app_logs_tamper ON public.app_logs;

CREATE TRIGGER trg_prevent_app_logs_tamper
BEFORE UPDATE ON public.app_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_app_logs_tamper();
