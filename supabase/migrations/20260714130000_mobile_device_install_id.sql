-- Corelyx Mobile — stable per-install device identity (fixes duplicate devices).
--
-- Problem: /api/mobile/register ran a bare INSERT on every sign-in, so signing
-- out and back in on the SAME phone piled up duplicate rows in the account's
-- device list. There was no stable identifier to recognise a returning install,
-- so the server treated each registration as a brand-new device.
--
-- Fix: the app now generates a durable install id — a random UUID kept in the OS
-- keychain that SURVIVES sign-out (only the device token is cleared) — and sends
-- it on register. The server upserts on (user_id, client_install_id): a returning
-- install rotates its token in place instead of creating a second row.

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS client_install_id TEXT;

COMMENT ON COLUMN public.devices.client_install_id IS
  'Stable per-install identifier reported by the Corelyx mobile app (random UUID in the device keychain, persists across sign-out). Used to recognise a returning install and rotate its token in place rather than registering a duplicate device. NULL for desktop/CLI devices that predate or do not report it.';

-- At most one active device per (user, install). A returning install updates its
-- existing row; this guards against a race creating two rows for one install.
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_user_install
  ON public.devices (user_id, client_install_id)
  WHERE client_install_id IS NOT NULL AND revoked_at IS NULL;
