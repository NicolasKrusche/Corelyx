import "server-only";

/**
 * Mobile push notifications via Expo's push service.
 *
 * Mirrors lib/email.ts: dependency-light (no SDK — a direct fetch to Expo's REST
 * endpoint), and env-gated so it no-ops cleanly when EXPO_ACCESS_TOKEN is unset
 * (local dev, or before mobile ships). Never throws to its caller: a failed push
 * must not break the run/approval/login flow that triggered it.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  /** Expo push tokens ("ExponentPushToken[...]"). */
  to: string[];
  title: string;
  body: string;
  /** Arbitrary JSON delivered to the app (used for deep-linking / 2FA ids). */
  data?: Record<string, unknown>;
  /** iOS badge count / Android channel hints, optional. */
  sound?: "default" | null;
  /** 'high' for time-sensitive (2FA); default 'normal'. */
  priority?: "default" | "normal" | "high";
}

/**
 * Send one or more push notifications. Returns true if the request was accepted
 * by Expo (best-effort — per-token delivery receipts are not awaited). No-ops
 * (returns false) when unconfigured or given no tokens.
 */
export async function sendExpoPush(message: ExpoPushMessage): Promise<boolean> {
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  const tokens = (message.to ?? []).filter(
    (t) => typeof t === "string" && t.startsWith("ExponentPushToken")
  );
  if (tokens.length === 0) return false;
  if (!accessToken) {
    console.warn("[push] EXPO_ACCESS_TOKEN not set — skipping push send");
    return false;
  }

  // Expo accepts an array of message objects, one per recipient token.
  const messages = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: message.sound === undefined ? "default" : message.sound,
    priority: message.priority ?? "high",
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[push] Expo error ${res.status}: ${text}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[push] send failed", err);
    return false;
  }
}
