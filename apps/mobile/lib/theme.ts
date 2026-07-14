/**
 * Shared design tokens for the Corelyx mobile app, matched to the web brand
 * (CORELYX_BRAND.md): dark, premium, operational — "deep blacks with colored
 * light beneath glass surfaces." The defining signature is GLASS: semi-
 * transparent white panels on near-black, with the orange primary accent.
 */
export const colors = {
  // Near-black coal background (brand #171717), a touch cooler for depth.
  bg: "#131315",
  bgElevated: "#161618", // solid surfaces where translucency can't sit (tab bar, headers)
  // Glass panel surfaces — semi-transparent white, like the web's .glass.
  surface: "rgba(255,255,255,0.045)",
  surfaceAlt: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.09)",
  borderStrong: "rgba(255,255,255,0.16)",
  text: "#f5f5f6",
  textMuted: "#9b9ba3",
  textFaint: "#6c6c74",
  // Primary accent — brand orange hsl(22 95% 52%).
  primary: "#f9660f",
  primaryText: "#ffffff",
  primarySoft: "rgba(249,102,15,0.14)", // tinted fill behind primary icons/chips
  primaryBorder: "rgba(249,102,15,0.35)",
  success: "#34d399",
  successSoft: "rgba(52,211,153,0.14)",
  warn: "#fbbf24",
  warnSoft: "rgba(251,191,36,0.14)",
  danger: "#f87171",
  dangerSoft: "rgba(248,113,113,0.14)",
  info: "#60a5fa",
  infoSoft: "rgba(96,165,250,0.14)",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

export const font = {
  h1: { fontSize: 27, fontWeight: "700" as const, color: colors.text, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: "700" as const, color: colors.text, letterSpacing: -0.2 },
  title: { fontSize: 16, fontWeight: "600" as const, color: colors.text },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.text },
  muted: { fontSize: 13, fontWeight: "400" as const, color: colors.textMuted },
  tiny: { fontSize: 12, fontWeight: "500" as const, color: colors.textFaint },
};

/** Subtle elevation for glass cards. */
export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
};

/** Status → semantic colour + matching soft tint (for badges/pills). */
export function statusColor(status: string): { fg: string; soft: string } {
  const s = status.toLowerCase();
  if (["completed", "success", "approved", "kept", "active"].includes(s))
    return { fg: colors.success, soft: colors.successSoft };
  if (["failed", "error", "rejected", "denied"].includes(s))
    return { fg: colors.danger, soft: colors.dangerSoft };
  if (["running", "pending", "waiting_approval", "paused", "awaiting_approval"].includes(s))
    return { fg: colors.warn, soft: colors.warnSoft };
  if (["cancelled", "skipped", "discarded", "dismissed", "draft"].includes(s))
    return { fg: colors.textFaint, soft: "rgba(255,255,255,0.06)" };
  return { fg: colors.info, soft: colors.infoSoft };
}
