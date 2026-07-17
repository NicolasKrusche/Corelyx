import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { loginChallengeFromNotification } from "@/lib/push";
import { colors } from "@/lib/theme";

/** Routes the app to login vs. tabs based on auth, and handles 2FA push taps. */
function RootNavigator() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Auth gate.
  useEffect(() => {
    if (status === "loading") return;
    const inAuthGroup = segments[0] === "login";
    if (status === "signed_out" && !inAuthGroup) {
      router.replace("/login");
    } else if (status === "signed_in" && inAuthGroup) {
      router.replace("/inbox");
    }
  }, [status, segments, router]);

  // Handle a 2FA push tapped from the background/quit state.
  useEffect(() => {
    if (status !== "signed_in") return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const challenge = loginChallengeFromNotification(response);
      if (challenge) {
        router.push({
          pathname: "/guard/[id]",
          params: { id: challenge.challenge_id, label: challenge.requester_label ?? "", ip: challenge.requester_ip ?? "" },
        });
      }
    });
    // Cold start: was the app opened by tapping a 2FA push?
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const challenge = loginChallengeFromNotification(response);
      if (challenge) {
        router.push({
          pathname: "/guard/[id]",
          params: { id: challenge.challenge_id, label: challenge.requester_label ?? "", ip: challenge.requester_ip ?? "" },
        });
      }
    });
    return () => sub.remove();
  }, [status, router]);

  // Always render the navigator so routes have an outlet from first frame — a
  // conditional non-navigator return here is what makes expo-router fall through
  // to the "Unmatched Route" screen. The initial route (index) shows the loading
  // state while auth resolves.
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="guard/[id]" options={{ presentation: "modal", title: "Approve sign-in" }} />
      <Stack.Screen name="run/[id]" options={{ title: "Run" }} />
      <Stack.Screen name="agent/[id]" options={{ title: "Agent" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
