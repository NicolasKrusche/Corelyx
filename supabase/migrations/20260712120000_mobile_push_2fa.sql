-- Corelyx Mobile — push devices, push-based 2FA ("Corelyx Guard"), and the
-- separation of the "default 2FA device" from the "default file-op device".
--
-- Context: the existing `devices` table (20260614120000) powers the desktop
-- Bridge that runs LOCAL FILE OPERATIONS. The "default device" a file node
-- targets is NOT a stored flag — it is computed as the most-recently-seen,
-- non-revoked device (resolve_default_device in apps/runtime/db.py and
-- resolveDefaultDeviceId in apps/web/lib/triggers/file-watch.ts). A phone that
-- phoned home would become that "default" and silently hijack file-op routing
-- to a device that cannot execute desktop file ops.
--
-- This migration therefore:
--   1. Lets a mobile phone live in `devices` (platform ios/android + push token).
--   2. Adds an EXPLICIT `is_default_2fa` flag — a SEPARATE axis from the file-op
--      default. The phone becomes the default *2FA* target; the file-op resolvers
--      are taught (in code, in lockstep) to EXCLUDE ios/android platforms so the
--      desktop Bridge keeps working.
--   3. Extends `two_factor_challenges` so one row serves both the emailed code
--      (existing) and a push approve/deny (new), converging on the same
--      corelyx-2fa trust cookie.

-- ─── devices: allow mobile platforms + push token + default-2FA flag ──────────

ALTER TABLE public.devices
  DROP CONSTRAINT IF EXISTS devices_platform_check;
ALTER TABLE public.devices
  ADD CONSTRAINT devices_platform_check
  CHECK (platform IN ('macos', 'windows', 'linux', 'unknown', 'ios', 'android'));

ALTER TABLE public.devices
  -- Expo push token ("ExponentPushToken[...]"). Nullable: a device may register
  -- before granting notification permission, or clear it on sign-out.
  ADD COLUMN IF NOT EXISTS push_token            TEXT,
  ADD COLUMN IF NOT EXISTS push_platform         TEXT
                             CHECK (push_platform IS NULL OR push_platform IN ('ios', 'android')),
  ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMPTZ,
  -- The user's designated phone for receiving push 2FA challenges. This is a
  -- DIFFERENT axis from the file-op "default device" (which is derived from
  -- last_seen_at and must stay a desktop Bridge). At most one per user.
  ADD COLUMN IF NOT EXISTS is_default_2fa        BOOLEAN NOT NULL DEFAULT FALSE;

-- One default 2FA device per user (ignoring revoked rows). Registering a new
-- phone flips the flag over to it (see lib/mobile-devices.ts setDefault2faDevice),
-- honouring "the phone always becomes the default 2FA device".
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_default_2fa
  ON public.devices (user_id)
  WHERE is_default_2fa AND revoked_at IS NULL;

-- Fast lookup of a user's push-capable, non-revoked mobile devices (push fan-out
-- and 2FA routing are per-USER, not per-workspace).
CREATE INDEX IF NOT EXISTS idx_devices_user_push
  ON public.devices (user_id)
  WHERE platform IN ('ios', 'android') AND revoked_at IS NULL;

COMMENT ON COLUMN public.devices.is_default_2fa IS
  'The user''s designated phone for push 2FA. Separate from the file-op default device (which is derived from last_seen_at and must remain a desktop Bridge).';

-- ─── two_factor_challenges: one row serves email code AND push approve/deny ────

ALTER TABLE public.two_factor_challenges
  -- How this challenge is being satisfied. 'email' = the legacy emailed code
  -- (unchanged). 'push' = a Corelyx Guard approve/deny on the phone; the emailed
  -- code is still generated and stored so the user can fall back to email.
  ADD COLUMN IF NOT EXISTS channel            TEXT NOT NULL DEFAULT 'email'
                             CHECK (channel IN ('email', 'push')),
  ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS denied_at          TIMESTAMPTZ,
  -- Which phone approved/denied (audit).
  ADD COLUMN IF NOT EXISTS approver_device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  -- Context about the sign-in attempt, shown to the user on the approve screen.
  ADD COLUMN IF NOT EXISTS requester_ip       TEXT,
  ADD COLUMN IF NOT EXISTS requester_label    TEXT;

-- Pending push challenges to resolve on approve, and to enforce single-flight.
CREATE INDEX IF NOT EXISTS idx_two_factor_challenges_pending_push
  ON public.two_factor_challenges (user_id, created_at DESC)
  WHERE channel = 'push' AND consumed_at IS NULL;
