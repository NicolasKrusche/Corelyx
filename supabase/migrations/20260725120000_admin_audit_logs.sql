-- Admin Audit Logs Table
-- Append-only audit trail for all administrative actions
-- Immutable: client roles cannot UPDATE/DELETE, only service role via RPC

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Actor (who performed the action)
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  actor_ip INET,
  actor_user_agent TEXT,

  -- Target (what was acted upon)
  target_type TEXT NOT NULL CHECK (target_type IN (
    'user', 'workspace', 'program', 'connector',
    'billing', 'security', 'compliance', 'system',
    'integration', 'admin'
  )),
  target_id UUID NOT NULL,
  target_identifier TEXT, -- email, slug, name for readability

  -- Action details
  action TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  reason TEXT,
  metadata JSONB,

  -- Request context
  request_id UUID,
  ip_address INET,
  user_agent TEXT,
  referer TEXT,

  -- Outcome
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  affected_resources UUID[],

  -- Compliance
  legal_basis TEXT NOT NULL CHECK (legal_basis IN (
    'legitimate_interest', 'contract', 'legal_obligation',
    'vital_interests', 'public_task', 'consent'
  )) DEFAULT 'legitimate_interest',
  data_subject_ids UUID[],
  retention_category TEXT NOT NULL CHECK (retention_category IN (
    'audit_log', 'security_log', 'compliance_evidence', 'operational_log'
  )) DEFAULT 'audit_log',
  retention_days INT NOT NULL DEFAULT 2555, -- 7 years default

  -- Correlation
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  correlation_id UUID,
  session_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_id ON public.admin_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_type_id ON public.admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON public.admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_risk_level ON public.admin_audit_logs(risk_level);
CREATE INDEX IF NOT EXISTS idx_admin_audit_timestamp ON public.admin_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_workspace_id ON public.admin_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_correlation_id ON public.admin_audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_success ON public.admin_audit_logs(success);
CREATE INDEX IF NOT EXISTS idx_admin_audit_legal_basis ON public.admin_audit_logs(legal_basis);
CREATE INDEX IF NOT EXISTS idx_admin_audit_retention ON public.admin_audit_logs(retention_category, timestamp);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_time ON public.admin_audit_logs(actor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_workspace_time ON public.admin_audit_logs(workspace_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_risk_time ON public.admin_audit_logs(risk_level, timestamp DESC);

-- RLS Policies
-- Client roles can only read their own audit logs (if they are the actor)
-- Service role bypasses RLS entirely

DROP POLICY IF EXISTS "own admin_audit_logs" ON public.admin_audit_logs;

CREATE POLICY "actors read own admin_audit_logs" ON public.admin_audit_logs
  FOR SELECT
  USING (auth.uid() = actor_id);

CREATE POLICY "admins read all admin_audit_logs" ON public.admin_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Block direct tampering by client-facing roles
REVOKE UPDATE, DELETE ON public.admin_audit_logs FROM anon, authenticated;

-- Immutability trigger - prevents modification of evidentiary columns
-- Allows FK housekeeping (workspace_id -> NULL) but blocks edits to audit content
CREATE OR REPLACE FUNCTION public.prevent_admin_audit_tamper()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.id          IS DISTINCT FROM OLD.id          OR
    NEW.timestamp   IS DISTINCT FROM OLD.timestamp   OR
    NEW.actor_id    IS DISTINCT FROM OLD.actor_id    OR
    NEW.actor_email IS DISTINCT FROM OLD.actor_email OR
    NEW.actor_role  IS DISTINCT FROM OLD.actor_role  OR
    NEW.actor_ip    IS DISTINCT FROM OLD.actor_ip    OR
    NEW.actor_user_agent IS DISTINCT FROM OLD.actor_user_agent OR
    NEW.target_type IS DISTINCT FROM OLD.target_type OR
    NEW.target_id   IS DISTINCT FROM OLD.target_id   OR
    NEW.target_identifier IS DISTINCT FROM OLD.target_identifier OR
    NEW.action      IS DISTINCT FROM OLD.action      OR
    NEW.risk_level  IS DISTINCT FROM OLD.risk_level  OR
    NEW.reason      IS DISTINCT FROM OLD.reason      OR
    NEW.metadata    IS DISTINCT FROM OLD.metadata    OR
    NEW.request_id  IS DISTINCT FROM OLD.request_id  OR
    NEW.ip_address  IS DISTINCT FROM OLD.ip_address  OR
    NEW.user_agent  IS DISTINCT FROM OLD.user_agent  OR
    NEW.referer     IS DISTINCT FROM OLD.referer     OR
    NEW.success     IS DISTINCT FROM OLD.success     OR
    NEW.error_message IS DISTINCT FROM OLD.error_message OR
    NEW.affected_resources IS DISTINCT FROM OLD.affected_resources OR
    NEW.legal_basis IS DISTINCT FROM OLD.legal_basis OR
    NEW.data_subject_ids IS DISTINCT FROM OLD.data_subject_ids OR
    NEW.retention_category IS DISTINCT FROM OLD.retention_category OR
    NEW.retention_days IS DISTINCT FROM OLD.retention_days OR
    NEW.correlation_id IS DISTINCT FROM OLD.correlation_id OR
    NEW.session_id  IS DISTINCT FROM OLD.session_id  OR
    NEW.created_at  IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'admin_audit_logs evidentiary columns are immutable';
  END IF;
  -- Allow workspace_id to be set NULL (FK housekeeping on workspace deletion)
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_admin_audit_tamper ON public.admin_audit_logs;
CREATE TRIGGER trg_prevent_admin_audit_tamper
BEFORE UPDATE ON public.admin_audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_admin_audit_tamper();

-- SECURITY DEFINER RPC to record admin audit logs
-- Only callable by service role (enforced by middleware)
CREATE OR REPLACE FUNCTION public.record_admin_audit_log(
  p_id UUID,
  p_timestamp TIMESTAMPTZ,
  p_actor_id UUID,
  p_actor_email TEXT,
  p_actor_role TEXT,
  p_actor_ip INET,
  p_actor_user_agent TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_target_identifier TEXT,
  p_action TEXT,
  p_risk_level TEXT,
  p_reason TEXT,
  p_metadata JSONB,
  p_request_id UUID,
  p_ip_address INET,
  p_user_agent TEXT,
  p_referer TEXT,
  p_success BOOLEAN,
  p_error_message TEXT,
  p_affected_resources UUID[],
  p_legal_basis TEXT,
  p_data_subject_ids UUID[],
  p_retention_category TEXT,
  p_retention_days INT,
  p_workspace_id UUID,
  p_correlation_id UUID,
  p_session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is service role
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'record_admin_audit_log: only service_role may call this function';
  END IF;

  INSERT INTO public.admin_audit_logs (
    id, timestamp, actor_id, actor_email, actor_role, actor_ip, actor_user_agent,
    target_type, target_id, target_identifier, action, risk_level, reason, metadata,
    request_id, ip_address, user_agent, referer, success, error_message,
    affected_resources, legal_basis, data_subject_ids, retention_category,
    retention_days, workspace_id, correlation_id, session_id
  ) VALUES (
    p_id, p_timestamp, p_actor_id, p_actor_email, p_actor_role, p_actor_ip, p_actor_user_agent,
    p_target_type, p_target_id, p_target_identifier, p_action, p_risk_level, p_reason, p_metadata,
    p_request_id, p_ip_address, p_user_agent, p_referer, p_success, p_error_message,
    p_affected_resources, p_legal_basis, p_data_subject_ids, p_retention_category,
    p_retention_days, p_workspace_id, p_correlation_id, p_session_id
  );
END;
$$;

-- RPC to query admin audit logs with filters (for admin panel)
CREATE OR REPLACE FUNCTION public.query_admin_audit_logs(
  p_actor_id UUID DEFAULT NULL,
  p_target_type TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_risk_level TEXT DEFAULT NULL,
  p_success BOOLEAN DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0,
  p_sort_by TEXT DEFAULT 'timestamp',
  p_sort_order TEXT DEFAULT 'desc'
)
RETURNS SETOF public.admin_audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sort_col TEXT;
  sort_dir TEXT;
BEGIN
  -- Verify caller has admin access
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    -- Non-admins can only see their own actions
    IF p_actor_id IS NULL OR p_actor_id <> auth.uid() THEN
      RAISE EXCEPTION 'query_admin_audit_logs: insufficient privileges';
    END IF;
  END IF;

  -- Validate sort column
  sort_col := CASE p_sort_by
    WHEN 'timestamp' THEN 'timestamp'
    WHEN 'riskLevel' THEN 'risk_level'
    WHEN 'action' THEN 'action'
    ELSE 'timestamp'
  END;

  sort_dir := CASE p_sort_order
    WHEN 'asc' THEN 'ASC'
    ELSE 'DESC'
  END;

  RETURN QUERY EXECUTE format(
    'SELECT * FROM public.admin_audit_logs
     WHERE ($1 IS NULL OR actor_id = $1)
     AND ($2 IS NULL OR target_type = $2)
     AND ($3 IS NULL OR target_id = $3)
     AND ($4 IS NULL OR action = $4)
     AND ($5 IS NULL OR risk_level = $5)
     AND ($6 IS NULL OR success = $6)
     AND ($7 IS NULL OR workspace_id = $7)
     AND ($8 IS NULL OR timestamp >= $8)
     AND ($9 IS NULL OR timestamp <= $9)
     ORDER BY %I %s
     LIMIT $10 OFFSET $11',
    sort_col, sort_dir
  )
  USING p_actor_id, p_target_type, p_target_id, p_action, p_risk_level,
        p_success, p_workspace_id, p_date_from, p_date_to, p_limit, p_offset;
END;
$$;

-- RPC to get admin audit stats for dashboard
CREATE OR REPLACE FUNCTION public.get_admin_audit_stats(
  p_workspace_id UUID DEFAULT NULL,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Verify caller has admin access
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'get_admin_audit_stats: insufficient privileges';
  END IF;

  SELECT jsonb_build_object(
    'totalActions', COUNT(*),
    'byRiskLevel', jsonb_build_object(
      'low', COUNT(*) FILTER (WHERE risk_level = 'low'),
      'medium', COUNT(*) FILTER (WHERE risk_level = 'medium'),
      'high', COUNT(*) FILTER (WHERE risk_level = 'high'),
      'critical', COUNT(*) FILTER (WHERE risk_level = 'critical')
    ),
    'byAction', (
      SELECT jsonb_object_agg(action, cnt)
      FROM (
        SELECT action, COUNT(*) as cnt
        FROM public.admin_audit_logs
        WHERE timestamp >= now() - (p_days || ' days')::interval
        AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
        GROUP BY action
      ) sub
    ),
    'failedActions', COUNT(*) FILTER (WHERE success = false),
    'criticalActions', COUNT(*) FILTER (WHERE risk_level = 'critical'),
    'topActors', (
      SELECT jsonb_agg(jsonb_build_object(
        'actorId', actor_id,
        'count', cnt,
        'maxRisk', max_risk
      ) ORDER BY cnt DESC)
      FROM (
        SELECT
          actor_id,
          COUNT(*) as cnt,
          CASE
            WHEN BOOL_OR(risk_level = 'critical') THEN 'critical'
            WHEN BOOL_OR(risk_level = 'high') THEN 'high'
            WHEN BOOL_OR(risk_level = 'medium') THEN 'medium'
            ELSE 'low'
          END as max_risk
        FROM public.admin_audit_logs
        WHERE timestamp >= now() - (p_days || ' days')::interval
        AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
        GROUP BY actor_id
        ORDER BY cnt DESC
        LIMIT 10
      ) sub
    )
  ) INTO result
  FROM public.admin_audit_logs
  WHERE timestamp >= now() - (p_days || ' days')::interval
  AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id);

  RETURN result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.record_admin_audit_log TO service_role;
GRANT EXECUTE ON FUNCTION public.query_admin_audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_audit_stats TO authenticated;