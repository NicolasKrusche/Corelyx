-- Security sentinel: structured security events plus scoped, automatic
-- containment locks.
--
-- Design: anomaly thresholds never shut the whole product down. Instead the
-- web app records security events here and, when a per-scope threshold is
-- crossed, applies a narrow lock (one webhook token, one program, one user)
-- with a TTL. Full maintenance mode stays a human decision via system_settings.
--
-- Both tables are service-role only: RLS is enabled with no policies, and the
-- RPCs are SECURITY DEFINER with execute revoked from anon/authenticated.

-- ── security_events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event      TEXT        NOT NULL,
  severity   TEXT        NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  -- What the event is about. scope_id is an opaque identifier — for webhook
  -- tokens it is a SHA-256 hash, never the raw credential.
  scope_type TEXT        NOT NULL,
  scope_id   TEXT        NOT NULL,
  user_id    UUID,
  details    JSONB,
  -- Automated action the sentinel took in response ('lock_applied', 'alerted').
  action     TEXT
);

CREATE INDEX IF NOT EXISTS idx_security_events_scope
  ON public.security_events (event, scope_type, scope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_created
  ON public.security_events (created_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- ── security_locks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_locks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type  TEXT        NOT NULL,
  scope_id    TEXT        NOT NULL,
  reason      TEXT        NOT NULL,
  locked_by   TEXT        NOT NULL DEFAULT 'sentinel',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by TEXT
);

-- One active lock per scope; released locks stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_locks_active
  ON public.security_locks (scope_type, scope_id)
  WHERE released_at IS NULL;

ALTER TABLE public.security_locks ENABLE ROW LEVEL SECURITY;

-- ── record_security_event ────────────────────────────────────────────────────
-- Atomic insert + count of identical-scope events inside the window, so
-- threshold rules behave consistently across serverless isolates.
CREATE OR REPLACE FUNCTION public.record_security_event(
  p_event TEXT,
  p_severity TEXT,
  p_scope_type TEXT,
  p_scope_id TEXT,
  p_user_id UUID,
  p_details JSONB,
  p_action TEXT,
  p_window_seconds INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_event IS NULL OR length(trim(p_event)) = 0 THEN
    RAISE EXCEPTION 'security event name is required';
  END IF;
  IF p_scope_type IS NULL OR p_scope_id IS NULL THEN
    RAISE EXCEPTION 'security event scope is required';
  END IF;

  INSERT INTO public.security_events
    (event, severity, scope_type, scope_id, user_id, details, action)
  VALUES
    (p_event, COALESCE(p_severity, 'info'), p_scope_type, p_scope_id,
     p_user_id, p_details, p_action);

  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RETURN 1;
  END IF;

  SELECT count(*)::INTEGER INTO v_count
  FROM public.security_events
  WHERE event = p_event
    AND scope_type = p_scope_type
    AND scope_id = p_scope_id
    AND created_at > now() - make_interval(secs => p_window_seconds);

  RETURN v_count;
END;
$$;

-- ── apply_security_lock ──────────────────────────────────────────────────────
-- Idempotent: re-applying to an already-locked scope extends the expiry.
CREATE OR REPLACE FUNCTION public.apply_security_lock(
  p_scope_type TEXT,
  p_scope_id TEXT,
  p_reason TEXT,
  p_locked_by TEXT,
  p_ttl_seconds INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires TIMESTAMPTZ;
  v_id UUID;
BEGIN
  IF p_scope_type IS NULL OR p_scope_id IS NULL THEN
    RAISE EXCEPTION 'security lock scope is required';
  END IF;

  v_expires := CASE
    WHEN p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 THEN NULL
    ELSE now() + make_interval(secs => p_ttl_seconds)
  END;

  INSERT INTO public.security_locks (scope_type, scope_id, reason, locked_by, expires_at)
  VALUES (p_scope_type, p_scope_id, COALESCE(p_reason, 'security lock'),
          COALESCE(p_locked_by, 'sentinel'), v_expires)
  ON CONFLICT (scope_type, scope_id) WHERE released_at IS NULL
  DO UPDATE SET
    reason = COALESCE(p_reason, public.security_locks.reason),
    expires_at = CASE
      WHEN v_expires IS NULL OR public.security_locks.expires_at IS NULL THEN NULL
      ELSE greatest(public.security_locks.expires_at, v_expires)
    END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── is_security_locked ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_security_locked(
  p_scope_type TEXT,
  p_scope_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.security_locks
    WHERE scope_type = p_scope_type
      AND scope_id = p_scope_id
      AND released_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- ── release_security_lock ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_security_lock(
  p_scope_type TEXT,
  p_scope_id TEXT,
  p_released_by TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released INTEGER;
BEGIN
  UPDATE public.security_locks
  SET released_at = now(),
      released_by = COALESCE(p_released_by, 'admin')
  WHERE scope_type = p_scope_type
    AND scope_id = p_scope_id
    AND released_at IS NULL;
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released > 0;
END;
$$;

-- Service-role only: these RPCs must not be callable from the public API.
REVOKE EXECUTE ON FUNCTION public.record_security_event(TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_security_lock(TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_security_locked(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_security_lock(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_security_event(TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_security_lock(TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_security_locked(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_security_lock(TEXT, TEXT, TEXT) TO service_role;
