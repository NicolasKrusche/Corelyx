import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { TWO_FACTOR_COOKIE, verifyCookieValue } from "@/lib/auth/two-factor";

// Entire authenticated app shell must be excluded from search index.
// All pages inside this group require login and contain user-specific data.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import { Sidebar } from "@/components/sidebar";
import { AppAmbient } from "@/components/app-ambient";
import { CommandPalette } from "@/components/command-palette";
import { DesktopBridgeHandshake } from "@/components/devices/desktop-bridge-handshake";
import { DesktopSessionWatcher } from "@/components/devices/desktop-session-watcher";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";
import { WelcomeOfferBanner } from "@/components/welcome-offer-banner";
import { MaintenanceAdminBanner } from "@/components/maintenance-admin-banner";
import { GenesisV2ReleaseGate } from "@/components/genesis/genesis-v2-release";
import { ensureAvatarBucket } from "@/lib/avatar-storage";

type AppLayoutUser = {
  id: string;
  email?: string | null;
  created_at: string;
  identities?: Array<{ provider?: string | null }>;
};

type AppLayoutProfile = {
  tier: "free" | "plus" | "pro" | "builder" | "unlimited";
  plan_expires_at: string | null;
  is_beta_tester: boolean;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  is_admin: boolean;
  username: string | null;
  legal_consented_at: string | null;
  email_2fa_enabled: boolean | null;
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowMockUser =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_ALLOW_MOCK_USER === "true";

  if (!user && !allowMockUser) redirect("/login");

  const appUser: AppLayoutUser =
    user ?? {
      id: "00000000-0000-0000-0000-000000000001",
      email: "test@test.com",
      created_at: new Date().toISOString(),
      identities: [],
    };

  try {
    await ensureAvatarBucket();
  } catch (error) {
    console.warn("[app] Could not ensure avatar bucket:", error);
  }

  const { data: profileRaw, error: profileError } = await supabase
    .from("profiles")
    .select("tier, plan_expires_at, is_beta_tester, display_name, avatar_url, created_at, is_admin, username, legal_consented_at, email_2fa_enabled")
    .eq("id", appUser.id)
    .single();
  const profile = profileRaw as AppLayoutProfile | null;

  // Only redirect to onboarding when the query succeeded but the profile is
  // genuinely incomplete. A DB error returns null data too — don't mistake
  // a transient failure for a new user and boot everyone to /onboarding.
  if (!profileError && !profile?.display_name && !profile?.username) {
    redirect("/onboarding");
  }

  // Gate app access until the user has accepted the current ToS + Privacy Policy.
  // Skip this check on the /consent page itself to avoid an infinite redirect.
  // Also skip for mock users in dev mode.
  if (!profileError && profile && !profile.legal_consented_at && !allowMockUser) {
    redirect("/consent");
  }

  // Email 2FA gate: an authenticated session is not enough when the user has
  // opted in — this browser must hold a valid signed verification cookie.
  // /verify-2fa lives outside this layout group (like /consent), so no loop.
  if (!profileError && profile?.email_2fa_enabled && !allowMockUser) {
    const cookieStore = await cookies();
    if (!verifyCookieValue(cookieStore.get(TWO_FACTOR_COOKIE)?.value, appUser.id)) {
      redirect("/verify-2fa");
    }
  }

  // Fetch XP stats for skill level calculation (parallel, best-effort)
  const [{ count: runCount }, { count: programCount }, { count: connectionCount }] = await Promise.all([
    supabase.from("runs").select("id", { count: "exact", head: true }).eq("user_id", appUser.id),
    supabase.from("programs").select("id", { count: "exact", head: true }).eq("user_id", appUser.id),
    supabase.from("connections").select("id", { count: "exact", head: true }).eq("user_id", appUser.id),
  ]);
  const skillXp =
    (runCount ?? 0) * 5 +
    (programCount ?? 0) * 50 +
    (connectionCount ?? 0) * 25;

  const isOAuthUser = !appUser.identities?.some((i) => i.provider === "email");
  
  // Check admin status via env var OR database flag
  const isAdmin = isAdminEmail(appUser.email ?? undefined) || profile?.is_admin === true;

  return (
    <div className="min-h-screen">
      <CommandPalette />
      <DesktopBridgeHandshake />
      <DesktopSessionWatcher />
      <Sidebar
        isAdmin={isAdmin}
        email={appUser.email ?? ""}
        tier={(isAdmin ? "unlimited" : (profile?.tier ?? "free")) as "free" | "plus" | "pro" | "builder" | "unlimited"}
        planExpiresAt={profile?.plan_expires_at ?? null}
        isBetaTester={profile?.is_beta_tester ?? false}
        userId={appUser.id}
        createdAt={profile?.created_at ?? appUser.created_at}
        initialDisplayName={profile?.display_name ?? ""}
        initialAvatarUrl={profile?.avatar_url ?? ""}
        isOAuthUser={isOAuthUser}
        initialUsername={profile?.username ?? ""}
        skillXp={skillXp}
      />
      <main className="relative ml-0 min-h-screen px-6 py-14 lg:ml-56 lg:mr-56 lg:px-0 lg:py-8">
        <div className="app-bg-gradient pointer-events-none fixed inset-0 -z-10 bg-background" />
        {/* Cinematic ambient layer (landing-film echo) behind every app page */}
        <AppAmbient />
        {/* Animated ambient orbs */}
        <div className="orb-primary" aria-hidden="true" />
        <div className="orb-blue" aria-hidden="true" />
        <div className="orb-violet" aria-hidden="true" />
        <div className="orb-cyan" aria-hidden="true" />
        {/* Obsidian geometric cell pattern — hidden by default, shown in obsidian style */}
        <svg
          className="obsidian-pattern pointer-events-none fixed inset-0 -z-[9] h-full w-full"
          style={{ opacity: 0.3, mixBlendMode: "screen" }}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <filter id="obsidian-cells" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="linearRGB">
            <feTurbulence type="turbulence" baseFrequency="0.022 0.018" numOctaves="2" seed="15" stitchTiles="stitch" result="turbulence" />
            <feColorMatrix type="saturate" values="0" in="turbulence" result="grey" />
            <feComponentTransfer in="grey">
              <feFuncR type="linear" slope="18" intercept="-8" />
              <feFuncG type="linear" slope="18" intercept="-8" />
              <feFuncB type="linear" slope="18" intercept="-8" />
            </feComponentTransfer>
          </filter>
          <rect width="100%" height="100%" filter="url(#obsidian-cells)" />
        </svg>
        <div className="w-full">
          <MaintenanceAdminBanner isAdmin={isAdmin} />
          <WelcomeOfferBanner
            createdAt={profile?.created_at ?? appUser.created_at}
            tier={profile?.tier ?? "free"}
          />
          {children}
        </div>
      </main>
      <GenesisV2ReleaseGate />
    </div>
  );
}
