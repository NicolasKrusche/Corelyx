-- Add notification_preferences JSONB column to profiles
-- Defaults: all on except product_updates (none sent yet)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{
    "run_failures": true,
    "approvals": true,
    "run_limit_warnings": true,
    "security_alerts": true,
    "product_updates": false
  }'::jsonb;

-- Index for fast single-key lookups (optional but cheap)
CREATE INDEX IF NOT EXISTS idx_profiles_notif_prefs
  ON profiles USING gin (notification_preferences);
