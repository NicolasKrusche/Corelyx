import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Filled glyph when focused, outline when not — a clean, cohesive icon set
 *  (Ionicons) replacing the old emoji, closer to the web app's line icons. */
function tabIcon(active: IoniconName, inactive: IoniconName) {
  return function TabBarIcon({ color, focused, size }: { color: string; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : inactive} size={size ?? 23} color={color} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 84,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen
        name="inbox"
        options={{ title: "Inbox", tabBarIcon: tabIcon("notifications", "notifications-outline") }}
      />
      <Tabs.Screen
        name="runs"
        options={{ title: "Runs", tabBarIcon: tabIcon("pulse", "pulse-outline") }}
      />
      <Tabs.Screen
        name="agents"
        options={{ title: "Agents", tabBarIcon: tabIcon("sparkles", "sparkles-outline") }}
      />
      <Tabs.Screen
        name="guard"
        options={{ title: "Guard", tabBarIcon: tabIcon("shield-checkmark", "shield-checkmark-outline") }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarIcon: tabIcon("person-circle", "person-circle-outline") }}
      />
    </Tabs>
  );
}
