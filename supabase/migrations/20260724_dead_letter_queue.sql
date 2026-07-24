-- Migration: Dead Letter Queue for failed node executions
-- Created: 2026-07-24
-- Provides dead_letter_entries table and supporting functions for failed node execution retry/purge

-- ─── Dead Letter Entries Table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dead_letter_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id      UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    run_id          UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
    node_id         TEXT NOT NULL,
    node_type       TEXT NOT NULL,
    node_config     JSONB NOT NULL DEFAULT '{}',
    input_data      JSONB NOT NULL DEFAULT '{}',
    error_message   TEXT NOT NULL,
    error_type      TEXT NOT NULL,
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    retry_policy    JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retried_at      TIMESTAMPTZ,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'retried', 'resolved', 'purged')),
    metadata        JSONB NOT NULL DEFAULT '{}'
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dead_letter_entries_program_id
    ON public.dead_letter_entries (program_id);

CREATE INDEX IF NOT EXISTS idx_dead_letter_entries_run_id
    ON public.dead_letter_entries (run_id);

CREATE INDEX IF NOT EXISTS idx_dead_letter_entries_node_id
    ON public.dead_letter_entries (node_id);

CREATE INDEX IF NOT EXISTS idx_dead_letter_entries_status
    ON public.dead_letter_entries (status);

CREATE INDEX IF NOT EXISTS idx_dead_letter_entries_created_at
    ON public.dead_letter_entries (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dead_letter_entries_program_status
    ON public.dead_letter_entries (program_id, status);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.dead_letter_entries ENABLE ROW LEVEL SECURITY;

-- Users can view dead letter entries for their own programs
CREATE POLICY "own dead_letter_entries select" ON public.dead_letter_entries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.programs p
            WHERE p.id = dead_letter_entries.program_id
              AND p.user_id = auth.uid()
        )
    );

-- Service role can do everything (for runtime enqueue/retrigger/purge)
GRANT ALL ON public.dead_letter_entries TO service_role;

-- ─── Helper Functions ───────────────────────────────────────────────────────

-- Trigger function to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_dead_letter_entries_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_dead_letter_entries_updated_at
    ON public.dead_letter_entries;

CREATE TRIGGER trigger_update_dead_letter_entries_updated_at
    BEFORE UPDATE ON public.dead_letter_entries
    FOR EACH ROW EXECUTE FUNCTION public.update_dead_letter_entries_updated_at();

-- Function to get dead letter stats for a program (admin/service role only)
CREATE OR REPLACE FUNCTION admin_dead_letter_stats(
    program_id UUID DEFAULT NULL
)
RETURNS TABLE (
    total BIGINT,
    pending BIGINT,
    retried BIGINT,
    resolved BIGINT,
    purged BIGINT,
    oldest_entry TIMESTAMPTZ,
    newest_entry TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT
        COUNT(*)::BIGINT AS total,
        COUNT(*) FILTER (WHERE status = 'pending')::BIGINT AS pending,
        COUNT(*) FILTER (WHERE status = 'retried')::BIGINT AS retried,
        COUNT(*) FILTER (WHERE status = 'resolved')::BIGINT AS resolved,
        COUNT(*) FILTER (WHERE status = 'purged')::BIGINT AS purged,
        MIN(created_at) AS oldest_entry,
        MAX(created_at) AS newest_entry
    FROM dead_letter_entries
    WHERE program_id = COALESCE(program_id, program_id);
$$;

REVOKE EXECUTE ON FUNCTION admin_dead_letter_stats(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_dead_letter_stats(UUID) TO service_role;

-- Function to purge old dead letter entries (service role only)
CREATE OR REPLACE FUNCTION admin_purge_old_dead_letters(
    older_than_days INT DEFAULT 30,
    program_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE dead_letter_entries
    SET status = 'purged', updated_at = NOW()
    WHERE created_at < NOW() - (older_than_days || ' days')::INTERVAL
      AND status != 'purged'
      AND (program_id = COALESCE(program_id, program_id))
    RETURNING 1;
$$;

REVOKE EXECUTE ON FUNCTION admin_purge_old_dead_letters(INT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_purge_old_dead_letters(INT, UUID) TO service_role;

-- Function to resolve a dead letter entry (service role only)
CREATE OR REPLACE FUNCTION admin_resolve_dead_letter(
    entry_id UUID,
    resolution_note TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE dead_letter_entries
    SET status = 'resolved',
        updated_at = NOW(),
        metadata = jsonb_set(COALESCE(metadata, '{}'), '{resolution_note}', to_jsonb(resolution_note))
    WHERE id = entry_id AND status != 'resolved'
    RETURNING TRUE;
$$;

REVOKE EXECUTE ON FUNCTION admin_resolve_dead_letter(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_resolve_dead_letter(UUID, TEXT) TO service_role;

-- Function to retrigger a dead letter entry (service role only)
-- Returns the new run_id if successful
CREATE OR REPLACE FUNCTION admin_retrigger_dead_letter(
    entry_id UUID,
    new_run_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    entry RECORD;
    run_id UUID;
    program_schema JSONB;
    node_config JSONB;
    node_exists BOOLEAN;
BEGIN
    -- Get the dead letter entry
    SELECT * INTO entry FROM dead_letter_entries WHERE id = entry_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dead letter entry % not found', entry_id;
    END IF;

    -- Check if program exists and get schema
    SELECT schema INTO program_schema FROM programs WHERE id = entry.program_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Program % not found', entry.program_id;
    END IF;

    -- Check if node exists in program
    SELECT EXISTS(
        SELECT 1 FROM jsonb_array_elements(program_schema->'nodes') AS n(node)
        WHERE n.node->>'id' = entry.node_id
    ) INTO node_exists;

    IF NOT node_exists THEN
        RAISE EXCEPTION 'Node % not found in program %', entry.node_id, entry.program_id;
    END IF;

    -- Create new run if not provided
    IF new_run_id IS NULL THEN
        run_id := gen_random_uuid();
        INSERT INTO runs (id, program_id, status, created_at, trigger_type)
        VALUES (run_id, entry.program_id, 'running', NOW(), 'retrigger');
    ELSE
        run_id := new_run_id;
    END IF;

    -- Create node execution record
    INSERT INTO node_executions (id, run_id, node_id, status, input_data, created_at)
    VALUES (gen_random_uuid(), run_id, entry.node_id, 'pending', entry.input_data, NOW());

    -- Update dead letter entry
    UPDATE dead_letter_entries
    SET status = 'retried',
        retried_at = NOW(),
        retry_count = retry_count + 1,
        updated_at = NOW()
    WHERE id = entry_id;

    RETURN run_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_retrigger_dead_letter(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_retrigger_dead_letter(UUID, UUID) TO service_role;

-- ─── Comments ────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.dead_letter_entries IS
    'Dead letter queue for failed node executions. Entries are enqueued when retries are exhausted.';

COMMENT ON COLUMN public.dead_letter_entries.program_id IS 'Reference to the program that owns this execution';
COMMENT ON COLUMN public.dead_letter_entries.run_id IS 'Reference to the run that failed';
COMMENT ON COLUMN public.dead_letter_entries.node_id IS 'Node ID that failed';
COMMENT ON COLUMN public.dead_letter_entries.node_type IS 'Type of the failed node (agent, step, connection, trigger)';
COMMENT ON COLUMN public.dead_letter_entries.node_config IS 'Full node configuration at time of failure';
COMMENT ON COLUMN public.dead_letter_entries.input_data IS 'Input data passed to the node';
COMMENT ON COLUMN public.dead_letter_entries.error_message IS 'Error message from the failure';
COMMENT ON COLUMN public.dead_letter_entries.error_type IS 'Exception type/class name';
COMMENT ON COLUMN public.dead_letter_entries.attempt_count IS 'Number of attempts made before giving up';
COMMENT ON COLUMN public.dead_letter_entries.retry_policy IS 'Retry policy that was applied';
COMMENT ON COLUMN public.dead_letter_entries.status IS 'Current status: pending (awaiting action), retried (re-queued for retry), resolved (manually handled), purged (cleaned up)';
COMMENT ON COLUMN public.dead_letter_entries.retry_count IS 'Number of times this entry has been retriggered';
COMMENT ON COLUMN public.dead_letter_entries.metadata IS 'Additional metadata, e.g., resolution_note';