import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

// Entire authenticated app shell must be excluded from search index.
// All pages inside this group require login and contain user-specific data.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";
import { WelcomeOfferBanner } from "@/components/welcome-offer-banner";
import { WhatsNewModal } from "@/components/whats-new-modal";
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

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("tier, plan_expires_at, is_beta_tester, display_name, avatar_url, created_at, is_admin, username")
    .eq("id", appUser.id)
    .single();
  const profile = profileRaw as AppLayoutProfile | null;

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
    <div className="min-h-screen bg-background">
      <WhatsNewModal />
      <CommandPalette />
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
        <div className="w-full">
          <WelcomeOfferBanner
            createdAt={profile?.created_at ?? appUser.created_at}
            tier={profile?.tier ?? "free"}
          />
          {children}
        </div>
      </main>
    </div>
  );
}
