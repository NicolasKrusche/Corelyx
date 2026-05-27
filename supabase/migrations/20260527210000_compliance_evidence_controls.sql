-- Compliance evidence controls for EU-only mode, AI Act workflow review,
-- retention policy, richer audit metadata, and approval-gate evidence.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS compliance_mode TEXT NOT NULL DEFAULT 'standard'
    CHECK (compliance_mode IN ('standard', 'eu_only')),
  ADD COLUMN IF NOT EXISTS execution_log_retention_days INTEGER NOT NULL DEFAULT 90
    CHECK (execution_log_retention_days > 0),
  ADD COLUMN IF NOT EXISTS prompt_retention_days INTEGER NOT NULL DEFAULT 0
    CHECK (prompt_retention_days >= 0),
  ADD COLUMN IF NOT EXISTS output_retention_days INTEGER NOT NULL DEFAULT 0
    CHECK (output_retention_days >= 0),
  ADD COLUMN IF NOT EXISTS approval_record_retention_days INTEGER NOT NULL DEFAULT 365
    CHECK (approval_record_retention_days > 0),
  ADD COLUMN IF NOT EXISTS secret_rotation_reminder_days INTEGER NOT NULL DEFAULT 90
    CHECK (secret_rotation_reminder_days > 0),
  ADD COLUMN IF NOT EXISTS store_full_prompts BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS store_full_outputs BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS data_region TEXT NOT NULL DEFAULT 'eu-central-1';

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS ai_use_case_category TEXT,
  ADD COLUMN IF NOT EXISTS ai_act_risk_level TEXT NOT NULL DEFAULT 'unknown'
    CHECK (ai_act_risk_level IN (
      'prohibited',
      'high_risk',
      'transparency',
      'gpai_related',
      'limited_or_minimal',
      'unknown'
    )),
  ADD COLUMN IF NOT EXISTS customer_role TEXT NOT NULL DEFAULT 'unknown'
    CHECK (customer_role IN (
      'provider',
      'deployer',
      'distributor',
      'importer',
      'product_manufacturer',
      'unknown'
    )),
  ADD COLUMN IF NOT EXISTS human_oversight_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transparency_notice_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS high_risk_documentation_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prohibited_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewer TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_act_notes TEXT,
  ADD COLUMN IF NOT EXISTS legal_review_override BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_version INTEGER,
  ADD COLUMN IF NOT EXISTS trigger_source TEXT,
  ADD COLUMN IF NOT EXISTS data_region TEXT,
  ADD COLUMN IF NOT EXISTS policy_checks JSONB,
  ADD COLUMN IF NOT EXISTS block_warning_reasons JSONB,
  ADD COLUMN IF NOT EXISTS retention_expiry TIMESTAMPTZ;

ALTER TABLE public.node_executions
  ADD COLUMN IF NOT EXISTS provider_id TEXT,
  ADD COLUMN IF NOT EXISTS model_id TEXT,
  ADD COLUMN IF NOT EXISTS prompt_hash TEXT,
  ADD COLUMN IF NOT EXISTS input_hash TEXT,
  ADD COLUMN IF NOT EXISTS output_hash TEXT,
  ADD COLUMN IF NOT EXISTS stored_full_prompt BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stored_full_input BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stored_full_output BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tool_calls JSONB,
  ADD COLUMN IF NOT EXISTS approval_request JSONB,
  ADD COLUMN IF NOT EXISTS approval_decision JSONB,
  ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_region TEXT,
  ADD COLUMN IF NOT EXISTS policy_checks JSONB,
  ADD COLUMN IF NOT EXISTS block_warning_reasons JSONB,
  ADD COLUMN IF NOT EXISTS retention_expiry TIMESTAMPTZ;

ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS requested_action TEXT,
  ADD COLUMN IF NOT EXISTS ai_generated_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS data_summary TEXT,
  ADD COLUMN IF NOT EXISTS risk_flags JSONB,
  ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision TEXT CHECK (decision IN ('approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS decision_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_executed_action JSONB;

CREATE INDEX IF NOT EXISTS idx_workspaces_compliance_mode
  ON public.workspaces (compliance_mode);

CREATE INDEX IF NOT EXISTS idx_programs_ai_act_risk
  ON public.programs (ai_act_risk_level);

CREATE INDEX IF NOT EXISTS idx_node_executions_provider
  ON public.node_executions (provider_id)
  WHERE provider_id IS NOT NULL;

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

  DELETE FROM public.data_retention_audit
   WHERE created_at < NOW() - p_audit_retention;
  GET DIAGNOSTICS v_deleted_audit_rows = ROW_COUNT;

  v_result := jsonb_build_object(
    'cleared_run_payloads', v_cleared_run_payloads,
    'cleared_node_input_payloads', v_cleared_node_input_payloads,
    'cleared_node_output_payloads', v_cleared_node_output_payloads,
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

REVOKE ALL ON FUNCTION public.purge_expired_operational_data(INTERVAL, INTERVAL, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_operational_data(INTERVAL, INTERVAL, INTERVAL) TO service_role;
