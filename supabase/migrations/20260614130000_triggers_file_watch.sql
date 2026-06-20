-- Corelyx Desktop Phase 2 — allow `file_watch` triggers.
--
-- A `file_watch` trigger fires a workflow/agent when a file changes inside a
-- granted folder on a paired desktop device. The desktop Bridge watches the
-- folder locally (it never exposes the filesystem to the cloud) and pushes change
-- events to the web app, which dispatches the matching triggers — the same firing
-- path the `event` trigger system already uses.
--
-- No new table: a file_watch trigger is an ordinary `triggers` row whose JSONB
-- `config` carries { trigger_type:'file_watch', device_id, path, events[],
-- patterns[] }. This migration only widens the `type` CHECK so those rows are
-- accepted. The original constraint was the unnamed inline CHECK from
-- 20240001_init.sql, auto-named `triggers_type_check`.

ALTER TABLE public.triggers DROP CONSTRAINT IF EXISTS triggers_type_check;

ALTER TABLE public.triggers
  ADD CONSTRAINT triggers_type_check
  CHECK (type IN ('manual', 'cron', 'webhook', 'event', 'program', 'file_watch'));

-- Partial index so the Bridge's "what should I watch on this device?" query and
-- the change-event dispatch can both find active file_watch rows cheaply.
CREATE INDEX IF NOT EXISTS triggers_file_watch_active_idx
  ON public.triggers (type)
  WHERE type = 'file_watch' AND is_active = TRUE;
