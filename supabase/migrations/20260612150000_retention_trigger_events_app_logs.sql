-- Retention gaps: trigger_events and app_logs were never purged.
--
-- trigger_events.payload stores raw inbound webhook bodies (third-party PII);
-- rows survive run deletion (run_id ON DELETE SET NULL) and only die with the
-- program. app_logs rows had IP anonymization (7d) but no deletion at all.
--
-- This extends purge_expired_operational_data:
--   - trigger_events.payload cleared after the workspace's
--     execution_log_retention_days (fallback: p_payload_retention, 30d) —
--     same policy as run trigger_payload.
--   - whole trigger_events rows deleted after p_run_retention (90d default),
--     matching run row deletion.
--   - app_logs rows deleted after p_app_log_retention (365d default).
--
-- The parameter list changes, so the old signature must be dropped first
-- (CREATE OR REPLACE with new defaulted params would create an overload and
-- callers would silently keep hitting the old function).

DROP FUNCTION IF EXISTS public.purge_expired_operational_data(INTERVAL, INTERVAL, INTERVAL);

CREATE FUNCTION public.purge_expired_operational_data(
  p_payload_retention INTERVAL DEFAULT INTERVAL '30 days',
  p_run_retention INTERVAL DEFAULT INTERVAL '90 days',
  p_audit_retention INTERVAL DEFAULT INTERVAL '365 days',
  p_app_log_retention INTERVAL DEFAULT INTERVAL '365 days'
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
  v_cleared_trigger_event_payloads INTEGER := 0;
  v_deleted_trigger_events INTEGER := 0;
  v_deleted_app_logs INTEGER := 0;
  v_deleted_approvals INTEGER := 0;
  v_deleted_runs INTEGER := 0;
  v_deleted_audit_rows INTEGER := 0;
  v_result JSONB;
BEGIN
  UPDATE public.runs r
     SET trigger_payload = NULL
    FROM public.programs p
    LEFT JOIN public.workspaces w ON w.id = p.workspace_id
   WHERE r.program_id = p.id
     AND r.trigger_payload IS NOT NULL
     AND r.created_at < NOW() - make_interval(days => COALESCE(w.execution_log_retention_days, EXTRACT(day FROM p_payload_retention)::INTEGER, 30));
  GET DIAGNOSTICS v_cleared_run_payloads = ROW_COUNT;

  UPDATE public.node_executions ne
     SET input_payload = NULL
    FROM public.runs r
    JOIN public.programs p ON p.id = r.program_id
    LEFT JOIN public.workspaces w ON w.id = p.workspace_id
   WHERE ne.run_id = r.id
     AND ne.input_payload IS NOT NULL
     AND ne.created_at < NOW() - make_interval(days => COALESCE(w.prompt_retention_days, EXTRACT(day FROM p_payload_retention)::INTEGER, 30));
  GET DIAGNOSTICS v_cleared_node_input_payloads = ROW_COUNT;

  UPDATE public.node_executions ne
     SET output_payload = NULL
    FROM public.runs r
    JOIN public.programs p ON p.id = r.program_id
    LEFT JOIN public.workspaces w ON w.id = p.workspace_id
   WHERE ne.run_id = r.id
     AND ne.output_payload IS NOT NULL
     AND ne.created_at < NOW() - make_interval(days => COALESCE(w.output_retention_days, EXTRACT(day FROM p_payload_retention)::INTEGER, 30));
  GET DIAGNOSTICS v_cleared_node_output_payloads = ROW_COUNT;

  -- Raw inbound webhook bodies age out on the same clock as run payloads.
  UPDATE public.trigger_events te
     SET payload = NULL
    FROM public.programs p
    LEFT JOIN public.workspaces w ON w.id = p.workspace_id
   WHERE te.program_id = p.id
     AND te.payload IS NOT NULL
     AND te.fired_at < NOW() - make_interval(days => COALESCE(w.execution_log_retention_days, EXTRACT(day FROM p_payload_retention)::INTEGER, 30));
  GET DIAGNOSTICS v_cleared_trigger_event_payloads = ROW_COUNT;

  WITH deleted AS (
    DELETE FROM public.approvals a
      USING public.node_executions ne
      JOIN public.runs r ON r.id = ne.run_id
      JOIN public.programs p ON p.id = r.program_id
      LEFT JOIN public.workspaces w ON w.id = p.workspace_id
     WHERE a.node_execution_id = ne.id
       AND a.created_at < NOW() - make_interval(days => COALESCE(w.approval_record_retention_days, 365))
     RETURNING a.id
  )
  SELECT COUNT(*)::INTEGER INTO v_deleted_approvals FROM deleted;

  WITH deleted AS (
    DELETE FROM public.runs r
      USING public.programs p
      LEFT JOIN public.workspaces w ON w.id = p.workspace_id
     WHERE r.program_id = p.id
       AND r.created_at < NOW() - make_interval(days => COALESCE(w.execution_log_retention_days, EXTRACT(day FROM p_run_retention)::INTEGER, 90))
       AND r.status IN ('completed', 'failed', 'cancelled')
     RETURNING r.id
  )
  SELECT COUNT(*)::INTEGER INTO v_deleted_runs FROM deleted;

  -- Trigger-event rows expire like run rows (they reference runs SET NULL, so
  -- run deletion alone never removes them).
  WITH deleted AS (
    DELETE FROM public.trigger_events te
      USING public.programs p
      LEFT JOIN public.workspaces w ON w.id = p.workspace_id
     WHERE te.program_id = p.id
       AND te.fired_at < NOW() - make_interval(days => COALESCE(w.execution_log_retention_days, EXTRACT(day FROM p_run_retention)::INTEGER, 90))
     RETURNING te.id
  )
  SELECT COUNT(*)::INTEGER INTO v_deleted_trigger_events FROM deleted;

  DELETE FROM public.app_logs
   WHERE created_at < NOW() - p_app_log_retention;
  GET DIAGNOSTICS v_deleted_app_logs = ROW_COUNT;

  DELETE FROM public.data_retention_audit
   WHERE created_at < NOW() - p_audit_retention;
  GET DIAGNOSTICS v_deleted_audit_rows = ROW_COUNT;

  v_result := jsonb_build_object(
    'cleared_run_payloads', v_cleared_run_payloads,
    'cleared_node_input_payloads', v_cleared_node_input_payloads,
    'cleared_node_output_payloads', v_cleared_node_output_payloads,
    'cleared_trigger_event_payloads', v_cleared_trigger_event_payloads,
    'deleted_trigger_events', v_deleted_trigger_events,
    'deleted_app_logs', v_deleted_app_logs,
    'deleted_approvals', v_deleted_approvals,
    'deleted_runs', v_deleted_runs,
    'deleted_audit_rows', v_deleted_audit_rows,
    'workspace_retention_controls', TRUE
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

REVOKE ALL ON FUNCTION public.purge_expired_operational_data(INTERVAL, INTERVAL, INTERVAL, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_operational_data(INTERVAL, INTERVAL, INTERVAL, INTERVAL) TO service_role;
