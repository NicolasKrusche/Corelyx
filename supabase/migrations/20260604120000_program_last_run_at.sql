-- Migration: Keep programs.last_run_at accurate.
--
-- The programs.last_run_at column has existed since the initial schema but was
-- never written by any code path, so the dashboard always showed "never" even
-- for programs that had run many times. Maintain it at the database level with a
-- trigger on the runs table so it stays correct for every run source (cron,
-- event, webhook, manual) — current and future — without app changes, then
-- backfill existing rows from the run history.

-- 1. Trigger function: advance programs.last_run_at when a run is recorded.
--    Uses GREATEST so an out-of-order or late insert never moves the timestamp
--    backwards. started_at is set when a run begins; fall back to created_at/now.
CREATE OR REPLACE FUNCTION public.sync_program_last_run_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ts TIMESTAMPTZ := COALESCE(NEW.started_at, NEW.created_at, NOW());
BEGIN
  UPDATE public.programs
  SET last_run_at = GREATEST(COALESCE(last_run_at, v_ts), v_ts)
  WHERE id = NEW.program_id;
  RETURN NEW;
END;
$$;

-- 2. Fire on insert (run created) and on the transition into started_at being
--    set, in case a run is created without a start time and started later.
DROP TRIGGER IF EXISTS trg_runs_sync_program_last_run_at ON public.runs;
CREATE TRIGGER trg_runs_sync_program_last_run_at
  AFTER INSERT OR UPDATE OF started_at ON public.runs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_program_last_run_at();

-- 3. Backfill from existing run history.
UPDATE public.programs p
SET last_run_at = r.last_ts
FROM (
  SELECT program_id, MAX(COALESCE(started_at, created_at)) AS last_ts
  FROM public.runs
  GROUP BY program_id
) r
WHERE r.program_id = p.id
  AND (p.last_run_at IS NULL OR p.last_run_at < r.last_ts);
