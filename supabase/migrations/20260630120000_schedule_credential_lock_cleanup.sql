-- Migration: schedule cleanup of expired credential_locks rows.
-- Created: 2026-06-30
--
-- cleanup_expired_credential_locks() was defined in 20260111120000 but never
-- scheduled, so the only cleanup was lazy (on contention for the same lock_key).
-- Now that web-initiated OAuth refreshes also use credential_locks, orphaned rows
-- (a holder that crashed between insert and release) could accumulate. Schedule a
-- periodic sweep via pg_cron when it is available, guarded so environments
-- without pg_cron (or lacking privileges to enable it) still apply cleanly.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      -- cron.schedule upserts by job name, so re-running this migration is safe.
      PERFORM cron.schedule(
        'cleanup-credential-locks',
        '*/10 * * * *',
        'SELECT cleanup_expired_credential_locks();'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron not available; credential_locks rely on lazy cleanup only';
  END IF;
END $$;
