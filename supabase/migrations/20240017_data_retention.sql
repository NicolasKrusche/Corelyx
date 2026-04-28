-- Automated operational-data retention for GDPR storage limitation.
-- Payload values are cleared before run metadata is deleted so FULL logging
-- deployments still get a shorter payload retention window.

CREATE TABLE IF NOT EXISTS public.data_retention_audit (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name                    TEXT NOT NULL,
  cleared_run_payloads         INTEGER NOT NULL DEFAULT 0,
  cleared_node_input_payloads  INTEGER NOT NULL DEFAULT 0,
  cleared_node_output_payloads INTEGER NOT NULL DEFAULT 0,
  deleted_runs                INTEGER NOT NULL DEFAULT 0,
  deleted_audit_rows          INTEGER NOT NULL DEFAULT 0,
  details                     JSONB,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_retention_audit_created
  ON public.data_retention_audit (created_at DESC);

ALTER TABLE public.data_retention_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.purge_expired_operational_data(
  p_payload_retention INTERVAL DEFAULT INTERVAL '30 days',
  p_run_retention INTERVAL DEFAULT INTERVAL '90 days',
  p_audit_retention INTERVAL DEFAULT INTERVAL '365 days'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleared_run_payloads INTEGER := 0;
  v_cleared_node_input_payloads INTEGER := 0;
  v_cleared_node_output_payloads INTEGER := 0;
  v_deleted_runs INTEGER := 0;
  v_deleted_audit_rows INTEGER := 0;
  v_result JSONB;
BEGIN
  UPDATE public.runs
     SET trigger_payload = NULL
   WHERE trigger_payload IS NOT NULL
     AND created_at < NOW() - p_payload_retention;
  GET DIAGNOSTICS v_cleared_run_payloads = ROW_COUNT;

  UPDATE public.node_executions
     SET input_payload = NULL
   WHERE input_payload IS NOT NULL
     AND created_at < NOW() - p_payload_retention;
  GET DIAGNOSTICS v_cleared_node_input_payloads = ROW_COUNT;

  UPDATE public.node_executions
     SET output_payload = NULL
   WHERE output_payload IS NOT NULL
     AND created_at < NOW() - p_payload_retention;
  GET DIAGNOSTICS v_cleared_node_output_payloads = ROW_COUNT;

  WITH deleted AS (
    DELETE FROM public.runs
     WHERE created_at < NOW() - p_run_retention
       AND status IN ('completed', 'failed', 'cancelled')
     RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_deleted_runs FROM deleted;

  DELETE FROM public.data_retention_audit
   WHERE created_at < NOW() - p_audit_retention;
  GET DIAGNOSTICS v_deleted_audit_rows = ROW_COUNT;

  v_result := jsonb_build_object(
    'cleared_run_payloads', v_cleared_run_payloads,
    'cleared_node_input_payloads', v_cleared_node_input_payloads,
    'cleared_node_output_payloads', v_cleared_node_output_payloads,
    'deleted_runs', v_deleted_runs,
    'deleted_audit_rows', v_deleted_audit_rows,
    'payload_retention', p_payload_retention::TEXT,
    'run_retention', p_run_retention::TEXT,
    'audit_retention', p_audit_retention::TEXT
  );

  INSERT INTO public.data_retention_audit (
    job_name,
    cleared_run_payloads,
    cleared_node_input_payloads,
    cleared_node_output_payloads,
    deleted_runs,
    deleted_audit_rows,
    details
  )
  VALUES (
    'purge_expired_operational_data',
    v_cleared_run_payloads,
    v_cleared_node_input_payloads,
    v_cleared_node_output_payloads,
    v_deleted_runs,
    v_deleted_audit_rows,
    v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_operational_data(INTERVAL, INTERVAL, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_operational_data(INTERVAL, INTERVAL, INTERVAL) TO service_role;
