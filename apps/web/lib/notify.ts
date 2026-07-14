import "server-only";
import { userPushTokens } from "@/lib/mobile-devices";
import { isNotificationEnabled, type NotificationPrefKey } from "@/lib/notification-prefs";
import { sendExpoPush } from "@/lib/push";

/**
 * Preference-gated push fan-out for the informational notification events
 * (run failures, approvals, agent reports, agent-flag escalations).
 *
 * This is a thin dispatcher, NOT a new event source: call it at the exact sites
 * that already send emails so push and email stay in sync — do not scatter
 * sendExpoPush across the codebase. The push-2FA login challenge is deliberately
 * NOT routed through here: it is a login mechanism, not a mutable preference, and
 * has its own send path (lib/mobile-devices resolve2faPushDevice + sendExpoPush).
 */
export async function notifyUserPush(
  userId: string,
  key: NotificationPrefKey,
  payload: { title: string; body: string; data?: Record<string, unknown> }
): Promise<void> {
  try {
    if (!(await isNotificationEnabled(userId, key, "push"))) return;
    const tokens = await userPushTokens(userId);
    if (tokens.length === 0) return;
    await sendExpoPush({
      to: tokens,
      title: payload.title,
      body: payload.body,
      data: { key, ...(payload.data ?? {}) },
      priority: "high",
    });
  } catch (err) {
    // Best-effort: a push failure must never break the caller's flow.
    console.error("[notify] push fan-out failed", err);
  }
}
