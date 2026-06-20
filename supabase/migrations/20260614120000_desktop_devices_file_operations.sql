-- Corelyx Desktop — devices, folder grants, and the file-operation queue.
--
-- The cloud runtime cannot touch a file on a user's machine. The desktop "Bridge"
-- runs on that machine and executes a fixed, sandboxed set of file operations on
-- the cloud's behalf. These three tables are the contract between them:
--
--   devices               — a paired machine running the Bridge (revocable).
--   device_folder_grants  — the folders a device is explicitly allowed to touch.
--   file_operations       — the suspend/resume queue. A workflow run hits a `file`
--                           node, enqueues a row (status 'pending'), and suspends;
--                           the Bridge claims it, executes it locally, writes the
--                           result, and the run resumes. Same pattern as the
--                           approvals table that powers HITL / corelyx.ask_user.
--
-- Security notes:
--   * Device tokens are NEVER stored in plaintext — only a SHA-256 hash. The
--     plaintext is shown to the user exactly once at pairing time.
--   * The Bridge re-validates every path against its local grants (defence in
--     depth); the grants here are the server-side source of truth and the audit.
--   * file_operations.args may transiently carry write content so it can reach the
--     Bridge. It is a queue, not an archive: retention-prune it. The durable audit
--     trail (path + op + outcome, never contents) lives in app_logs.

-- ─── devices ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'My device',
  platform      TEXT NOT NULL DEFAULT 'unknown'
                  CHECK (platform IN ('macos', 'windows', 'linux', 'unknown')),
  -- SHA-256 hex of the device token. Unique so a token maps to exactly one device.
  token_hash    TEXT NOT NULL UNIQUE,
  -- First several chars of the token, for "•••• a1b2" identification in the UI.
  token_prefix  TEXT NOT NULL DEFAULT '',
  paired_at     TIMESTAMPTZ,
  last_seen_at  TIMESTAMPTZ,
  -- Non-null once revoked; a revoked device's token is rejected and its pending
  -- operations are cancelled. Kept (not deleted) so history/audit survives.
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_workspace
  ON public.devices (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_devices_token_hash
  ON public.devices (token_hash);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Workspace members manage their devices (list, rename, revoke). Token creation
-- and Bridge authentication run through the service-role client in server code.
CREATE POLICY "workspace members manage devices" ON public.devices
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = devices.workspace_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.devices IS
  'A paired machine running the Corelyx Desktop Bridge. Token stored only as a hash.';

-- ─── device_folder_grants ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.device_folder_grants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  -- Denormalised for one-hop RLS and workspace-scoped listing.
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Absolute, canonicalised folder path the device is allowed to access. Every
  -- file operation must resolve to a real path inside one of these roots.
  path          TEXT NOT NULL,
  permission    TEXT NOT NULL DEFAULT 'read'
                  CHECK (permission IN ('read', 'read_write')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A device should not hold two grants for the same folder.
  UNIQUE (device_id, path)
);

CREATE INDEX IF NOT EXISTS idx_device_folder_grants_device
  ON public.device_folder_grants (device_id);

ALTER TABLE public.device_folder_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage device_folder_grants"
  ON public.device_folder_grants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = device_folder_grants.workspace_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.device_folder_grants IS
  'Folders a device is explicitly allowed to access. The path sandbox boundary.';

-- ─── file_operations ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.file_operations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID REFERENCES public.runs(id) ON DELETE CASCADE,
  node_execution_id UUID REFERENCES public.node_executions(id) ON DELETE CASCADE,
  -- Target device. NULL means "the workspace's default active device"; the web
  -- enqueue path resolves this to a concrete device before the Bridge polls.
  device_id         UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  op_type           TEXT NOT NULL
                      CHECK (op_type IN (
                        'read', 'write', 'append', 'list', 'stat',
                        'move', 'copy', 'delete', 'mkdir', 'search'
                      )),
  -- Operation arguments (path, dest, content, pattern, ...). Transient — pruned
  -- with the run. Never the durable audit record.
  args              JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending', 'claimed', 'running', 'done', 'error', 'cancelled'
                      )),
  -- Result of a completed op (read content, listing, stat metadata, ...).
  result            JSONB,
  error             TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  -- The run stops waiting after this instant ("waiting for your device" → fail).
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes')
);

-- The Bridge polls for work addressed to its device that is still pending.
CREATE INDEX IF NOT EXISTS idx_file_operations_device_status
  ON public.file_operations (device_id, status, requested_at);
-- The runtime waits on a specific row by run / node execution.
CREATE INDEX IF NOT EXISTS idx_file_operations_run
  ON public.file_operations (run_id);
CREATE INDEX IF NOT EXISTS idx_file_operations_workspace
  ON public.file_operations (workspace_id, requested_at);

ALTER TABLE public.file_operations ENABLE ROW LEVEL SECURITY;

-- Workspace members may READ the queue (so the UI can show "waiting for your
-- device", results, errors). All writes — enqueue by the runtime, claim/complete
-- by the Bridge — go through the service-role client in server code, after the
-- device token has been validated.
CREATE POLICY "workspace members read file_operations"
  ON public.file_operations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = file_operations.workspace_id
        AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.file_operations IS
  'Suspend/resume queue for local file operations. Runtime enqueues; Bridge executes.';
