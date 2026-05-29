-- Governance hardening: app_logs are the immutable audit trail for
-- governance events that are not solely captured by runs/node_executions.

DROP POLICY IF EXISTS "own app_logs" ON public.app_logs;

CREATE POLICY "users read own app_logs" ON public.app_logs
  FOR SELECT
  USING (auth.uid() = user_id);

REVOKE UPDATE, DELETE ON public.app_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_app_logs_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'app_logs are immutable audit records';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_app_logs_mutation ON public.app_logs;

CREATE TRIGGER trg_prevent_app_logs_mutation
BEFORE UPDATE OR DELETE ON public.app_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_app_logs_mutation();

