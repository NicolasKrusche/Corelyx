import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, shadow, spacing, statusColor } from "@/lib/theme";
import { AmbientBackground, Logo } from "./brand";

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.screen}>
      <AmbientBackground />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

export function ScreenTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={font.h1}>{title}</Text>
        {subtitle ? <Text style={[font.muted, { marginTop: 3 }]}>{subtitle}</Text> : null}
      </View>
      {/* Subtle Corelyx mark on every screen header unless a screen supplies its own. */}
      {right ?? <Logo size={26} showWordmark={false} />}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export type Tone = "primary" | "success" | "danger" | "info" | "warn" | "muted";

const TONE: Record<Tone, { soft: string; fg: string }> = {
  primary: { soft: colors.primarySoft, fg: colors.primary },
  success: { soft: colors.successSoft, fg: colors.success },
  danger: { soft: colors.dangerSoft, fg: colors.danger },
  info: { soft: colors.infoSoft, fg: colors.info },
  warn: { soft: colors.warnSoft, fg: colors.warn },
  muted: { soft: "rgba(255,255,255,0.06)", fg: colors.textMuted },
};

/** Rounded, tinted square holding an icon — the web's `bg-primary/10` icon motif. */
export function IconTile({ name, tone = "primary", size = 44 }: { name: IconName; tone?: Tone; size?: number }) {
  const t = TONE[tone];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: t.soft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={name} size={size * 0.46} color={t.fg} />
    </View>
  );
}

export function Badge({ label }: { label: string }) {
  const { fg, soft } = statusColor(label);
  return (
    <View style={[styles.badge, { backgroundColor: soft }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[font.tiny, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** Small pill chip (e.g. "scheduled", "2FA default"). */
export function Chip({ label, icon, tone = "muted" }: { label: string; icon?: IconName; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.soft }]}>
      {icon ? <Ionicons name={icon} size={11} color={t.fg} /> : null}
      <Text style={[font.tiny, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, icon }: { title: string; icon?: IconName }) {
  return (
    <View style={styles.sectionHeader}>
      {icon ? <Ionicons name={icon} size={14} color={colors.textMuted} /> : null}
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
}) {
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
      ? colors.dangerSoft
      : variant === "secondary"
      ? colors.surfaceAlt
      : "transparent";
  const fg =
    variant === "primary" ? colors.primaryText : variant === "danger" ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "primary" && shadow.card,
        (variant === "ghost" || variant === "danger") && {
          borderWidth: 1,
          borderColor: variant === "danger" ? colors.dangerSoft : colors.border,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon ? <Ionicons name={icon} size={17} color={fg} /> : null}
          <Text style={{ color: fg, fontWeight: "600", fontSize: 15 }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text style={[font.muted, { marginTop: spacing.sm }]}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: IconName }) {
  return (
    <View style={styles.center}>
      {icon ? (
        <View style={{ marginBottom: spacing.md }}>
          <Ionicons name={icon} size={40} color={colors.textFaint} />
        </View>
      ) : null}
      <Text style={font.title}>{title}</Text>
      {body ? (
        <Text style={[font.muted, { marginTop: spacing.xs, textAlign: "center", paddingHorizontal: spacing.xl }]}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  button: {
    height: 50,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
});
