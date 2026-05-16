/**
 * Server-side helper for reading notification preferences.
 * Used by email-sending code to gate sends on user preferences.
 */

import { createServiceClient } from "@/lib/api";

export type NotificationPrefKey =
  | "run_failures"
  | "approvals"
  | "run_limit_warnings"
  | "security_alerts"
  | "product_updates";

export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

const DEFAULTS: NotificationPrefs = {
  run_failures:       true,
  approvals:          true,
  run_limit_warnings: true,
  security_alerts:    true,
  product_updates:    false,
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
 * Returns true if the user has a specific notification type enabled.
 * Defaults to true if the preference is not set (safe default = send).
 */
export async function isNotificationEnabled(
  userId: string,
  key: NotificationPrefKey
): Promise<boolean> {
  const prefs = await getUserNotificationPrefs(userId);
  return prefs[key] ?? DEFAULTS[key];
}
