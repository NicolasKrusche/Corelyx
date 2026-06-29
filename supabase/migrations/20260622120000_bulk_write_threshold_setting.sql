-- Per-workspace bulk-write approval threshold.
-- Configurable safety net: once a single run crosses this many connector write
-- operations, it pauses once for explicit human approval before continuing.
-- Default 25 matches the previous hard-coded BULK_WRITE_APPROVAL_THRESHOLD.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS bulk_write_approval_threshold INTEGER NOT NULL DEFAULT 25
    CHECK (bulk_write_approval_threshold > 0);
