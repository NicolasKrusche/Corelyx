-- Migration: Anonymise incidental IP addresses in diagnostic logs after 7 days.
--
-- Corelyx does not deliberately store IP addresses in its application database,
-- but an IP can incidentally land in an app_logs message/details field (e.g. a
-- diagnostic log line). The Privacy Policy commits to anonymising such IPs within
-- 7 days; this function backs that commitment and is run daily by the existing
-- data-retention job. Idempotent: once an IP is replaced the row no longer
-- matches the IP pattern, so it is not reprocessed.

CREATE OR REPLACE FUNCTION public.anonymize_expired_log_ips(
  p_retention INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- IPv4, plus a loose IPv6 (hex groups separated by colons).
  v_ipv4 TEXT := '(\d{1,3}\.){3}\d{1,3}';
  v_ipv6 TEXT := '([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4}';
  v_pattern TEXT;
  v_placeholder TEXT := '[REDACTED_IP]';
  v_messages INTEGER := 0;
  v_details INTEGER := 0;
  v_result JSONB;
BEGIN
  v_pattern := '(' || v_ipv4 || '|' || v_ipv6 || ')';

  UPDATE public.app_logs
     SET message = regexp_replace(message, v_pattern, v_placeholder, 'g')
   WHERE created_at < NOW() - p_retention
     AND message ~ v_pattern;
  GET DIAGNOSTICS v_messages = ROW_COUNT;

  UPDATE public.app_logs
     SET details = regexp_replace(details::text, v_pattern, v_placeholder, 'g')::jsonb
   WHERE created_at < NOW() - p_retention
     AND details IS NOT NULL
     AND details::text ~ v_pattern;
  GET DIAGNOSTICS v_details = ROW_COUNT;

  v_result := jsonb_build_object(
    'anonymized_log_messages', v_messages,
    'anonymized_log_details', v_details,
    'retention', p_retention::TEXT
  );

  INSERT INTO public.data_retention_audit (job_name, details)
  VALUES ('anonymize_expired_log_ips', v_result);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_expired_log_ips(INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_expired_log_ips(INTERVAL) TO service_role;
