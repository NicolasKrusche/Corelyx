-- Pending migrations not yet applied to your Supabase database (probed 2026-07-04).
-- Run this whole file once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Everything is idempotent, so re-running is safe. Delete this file afterwards.
--
-- This fixes the "internal server error" on Manage workspaces: /api/workspaces
-- selects workspaces.bulk_write_approval_threshold, which does not exist yet.

-- ── 20260621140000_agent_flags.sql ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  program_id      UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  run_id          UUID,
  user_id         UUID,
  source_provider TEXT,
  source_ref      TEXT,
  subject         TEXT,
  snippet         TEXT,
  reason          TEXT,
  categories      TEXT[] NOT NULL DEFAULT '{}',
  origin          TEXT NOT NULL DEFAULT 'auto' CHECK (origin IN ('auto', 'agent')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'kept', 'dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID
);

CREATE INDEX IF NOT EXISTS idx_agent_flags_workspace_status
  ON public.agent_flags (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_flags_program
  ON public.agent_flags (program_id);

ALTER TABLE public.agent_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members read agent_flags" ON public.agent_flags;
CREATE POLICY "workspace members read agent_flags"
  ON public.agent_flags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = agent_flags.workspace_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspace members resolve agent_flags" ON public.agent_flags;
CREATE POLICY "workspace members resolve agent_flags"
  ON public.agent_flags
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = agent_flags.workspace_id AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.agent_flags IS
  'Critical-signal safety flags (auto-screened or agent-escalated) shown in the Flagged-for-review inbox.';

-- ── 20260622120000_bulk_write_threshold_setting.sql ─────────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS bulk_write_approval_threshold INTEGER NOT NULL DEFAULT 25
    CHECK (bulk_write_approval_threshold > 0);

-- ── 20260630120000_schedule_credential_lock_cleanup.sql ─────────────────────
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
