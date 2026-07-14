/**
 * Server-side helper for reading notification preferences.
 * Used by email-sending code to gate sends on user preferences.
 */

import { createServiceClient } from "@/lib/api";

export type NotificationPrefKey =
  | "run_failures"
  | "approvals"
  | "agent_reports"
  | "run_limit_warnings"
  | "security_alerts"
  | "product_updates";

export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

export type NotificationChannel = "email" | "push";

const DEFAULTS: NotificationPrefs = {
  run_failures:       true,
  approvals:          true,
  agent_reports:      true,
  run_limit_warnings: true,
  security_alerts:    true,
  product_updates:    false,
};

// Push defaults are opt-out for the actionable events (mirroring email) but keep
// product_updates off. security_alerts is always-on on both channels. Push prefs
// are stored under `push_<key>` in the same profiles.notification_preferences
// JSON, so adding push does NOT change existing email booleans.
const PUSH_DEFAULTS: NotificationPrefs = {
  run_failures:       true,
  approvals:          true,
  agent_reports:      true,
  run_limit_warnings: true,
  security_alerts:    true,
  product_updates:    false,
};

// Preferences the user cannot mute (they are safety-critical).
const ALWAYS_ON: Partial<Record<NotificationPrefKey, true>> = {
  security_alerts: true,
};

/**
 * Returns the full notification preferences for a user,
 * merging any missing keys with defaults.
 */
export async function getUserNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("profiles")
      .select("notification_preferences")
      .eq("id", userId)
      .single();

    const raw = (data as { notification_preferences?: Partial<NotificationPrefs> } | null)
      ?.notification_preferences ?? {};

    return { ...DEFAULTS, ...raw };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Returns true if the user has a specific notification type enabled on the given
 * channel. Defaults to a safe "send" for unset prefs. security_alerts is always
 * on. The default channel is "email" so every existing caller is unchanged.
 */
export async function isNotificationEnabled(
  userId: string,
  key: NotificationPrefKey,
  channel: NotificationChannel = "email"
): Promise<boolean> {
  if (ALWAYS_ON[key]) return true;

  try {
    const service = createServiceClient();
    const { data } = await service
      .from("profiles")
      .select("notification_preferences")
      .eq("id", userId)
      .single();
    const raw =
      (data as { notification_preferences?: Record<string, boolean> } | null)
        ?.notification_preferences ?? {};

    if (channel === "push") {
      const value = raw[`push_${key}`];
      return typeof value === "boolean" ? value : PUSH_DEFAULTS[key];
    }
    const value = raw[key];
    return typeof value === "boolean" ? value : DEFAULTS[key];
  } catch {
    return channel === "push" ? PUSH_DEFAULTS[key] : DEFAULTS[key];
  }
}
