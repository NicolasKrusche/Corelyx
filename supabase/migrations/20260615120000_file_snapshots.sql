-- Corelyx Desktop Phase 2 — file rollback sandbox (snapshot metadata).
--
-- Before the Bridge modifies or deletes an existing file (write/append/delete/
-- move/overwrite), it copies the prior bytes to a LOCAL snapshot store on the
-- device. The bytes never leave the machine; only this metadata row is reported
-- to the cloud, so the user can browse "what changed" and trigger a restore from
-- the web. A restore is just another file_operation (`op_type = 'restore'`) the
-- Bridge picks up and applies locally by its `snapshot_ref`.

-- 1. Allow the restore operation in the file_operations queue.
ALTER TABLE public.file_operations DROP CONSTRAINT IF EXISTS file_operations_op_type_check;
ALTER TABLE public.file_operations
  ADD CONSTRAINT file_operations_op_type_check
  CHECK (op_type IN (
    'read', 'write', 'append', 'list', 'stat',
    'move', 'copy', 'delete', 'mkdir', 'search', 'restore'
  ));

-- 2. Snapshot metadata (the bytes stay on the device, keyed by snapshot_ref).
CREATE TABLE IF NOT EXISTS public.file_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  device_id      UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  -- Provenance: the run / op that caused the change (both may be null for a
  -- change made outside a run, or once the run is pruned).
  run_id         UUID REFERENCES public.runs(id) ON DELETE SET NULL,
  op_id          UUID REFERENCES public.file_operations(id) ON DELETE SET NULL,
  -- Opaque id the Bridge uses to find the saved bytes on the device.
  snapshot_ref   TEXT NOT NULL,
  original_path  TEXT NOT NULL,
  -- The operation that triggered the snapshot (write/append/delete/move/copy).
  operation      TEXT NOT NULL,
  size_bytes     BIGINT NOT NULL DEFAULT 0,
  -- Whether the path existed before the op. false → "restore" means delete the
  -- file the op created (undo a creation).
  existed        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  restored_at    TIMESTAMPTZ,
  -- When the Bridge will have pruned the local bytes; the UI greys out restore.
  expires_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_file_snapshots_workspace
  ON public.file_snapshots (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_snapshots_device
  ON public.file_snapshots (device_id, created_at DESC);

ALTER TABLE public.file_snapshots ENABLE ROW LEVEL SECURITY;

-- Workspace members may READ their snapshot history (to browse + restore in the
-- UI). All writes go through the service-role client in server code after the
-- device token (report) or session (restore trigger) has been validated.
CREATE POLICY "workspace members read file_snapshots"
  ON public.file_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = file_snapshots.workspace_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.file_snapshots IS
  'Rollback metadata for local file changes. Bytes live on the device; this is '
  'only the index the web UI uses to browse history and trigger a restore.';
