import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Push-notification registration and the "tap → navigate" wiring.
 *
 * A 2FA login-challenge push carries { kind: 'login_challenge', challenge_id }.
 * Tapping it must deep-link to the approve screen; the app registers a response
 * listener (see app/_layout.tsx) that reads this payload.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Ask for permission and return the Expo push token, or null if unavailable. */
export async function registerForPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // push doesn't work on simulators

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      lightColor: "#ea580c",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  try {
    const token = await Promise.race([
      Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("push token timeout")), 8000)
      ),
    ]);
    return (token as { data: string }).data;
  } catch {
    // Remote push isn't available in Expo Go / when permission is denied — fine,
    // Guard still works via the app's polling. Return null so nothing blocks.
    return null;
  }
}

export type LoginChallengePush = {
  kind: "login_challenge";
  challenge_id: string;
  requester_label?: string;
  requester_ip?: string;
  expires_at?: string;
};

/** Extract a login-challenge payload from a notification, if present. */
export function loginChallengeFromNotification(
  notification: Notifications.NotificationResponse | Notifications.Notification | null
): LoginChallengePush | null {
  const content =
    (notification as Notifications.NotificationResponse)?.notification?.request?.content ??
    (notification as Notifications.Notification)?.request?.content;
  const data = content?.data as Record<string, unknown> | undefined;
  if (data?.kind === "login_challenge" && typeof data.challenge_id === "string") {
    return {
      kind: "login_challenge",
      challenge_id: data.challenge_id,
      requester_label: typeof data.requester_label === "string" ? data.requester_label : undefined,
      requester_ip: typeof data.requester_ip === "string" ? data.requester_ip : undefined,
      expires_at: typeof data.expires_at === "string" ? data.expires_at : undefined,
    };
  }
  return null;
}
