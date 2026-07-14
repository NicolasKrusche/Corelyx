import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, shadow } from "@/lib/theme";

// Relative require (not the @/ alias) so Metro's asset resolver can't miss it.
const LOGO = require("../assets/logo.png");

/** The Corelyx mark + wordmark, using the same logo asset as the web app. */
export function Logo({ size = 32, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.32 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          ...shadow.card,
        }}
      >
        <Image source={LOGO} style={{ width: size * 0.66, height: size * 0.66 }} resizeMode="contain" />
      </View>
      {showWordmark ? (
        <Text style={{ fontSize: size * 0.62, fontWeight: "700", color: colors.text, letterSpacing: -0.5 }}>
          Corelyx
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Ambient background — the brand's "colored light beneath glass" signature:
 * soft orange (top-right), blue (bottom-left), and violet (center) glows drifting
 * behind the near-black base. Kept subtle (low alpha) so it reads as depth, not
 * decoration; the translucent glass cards let it bleed through. Non-interactive.
 */
function Orb({
  color,
  style,
  diameter = 460,
}: {
  color: string;
  style: object;
  diameter?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        { position: "absolute", width: diameter, height: diameter, borderRadius: diameter / 2, overflow: "hidden" },
        style,
      ]}
    >
      <LinearGradient
        colors={[color, "transparent"]}
        start={{ x: 0.5, y: 0.1 }}
        end={{ x: 0.5, y: 0.95 }}
        style={{ flex: 1 }}
      />
    </View>
  );
}

export function AmbientBackground() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      <Orb color="rgba(249,102,15,0.07)" diameter={520} style={{ top: -200, right: -160 }} />
      <Orb color="rgba(59,130,246,0.05)" diameter={500} style={{ bottom: -220, left: -170 }} />
      <Orb color="rgba(139,92,246,0.04)" diameter={440} style={{ top: 260, left: 40 }} />
    </View>
  );
}
