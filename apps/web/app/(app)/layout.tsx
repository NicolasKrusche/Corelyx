import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";
import { WelcomeOfferBanner } from "@/components/welcome-offer-banner";
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
    .select("tier, plan_expires_at, is_beta_tester, display_name, avatar_url, created_at, is_admin")
    .eq("id", appUser.id)
    .single();
  const profile = profileRaw as AppLayoutProfile | null;

  const isOAuthUser = !appUser.identities?.some((i) => i.provider === "email");
  
  // Check admin status via env var OR database flag
  const isAdmin = isAdminEmail(appUser.email ?? undefined) || profile?.is_admin === true;

  return (
    <div className="min-h-screen bg-background">
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
      />
      <main className="relative ml-0 min-h-screen px-6 py-14 lg:ml-16 lg:px-8 lg:py-8">
        <div className="app-bg-gradient pointer-events-none fixed inset-0 -z-10 bg-background" />
        <div className="mx-auto w-full max-w-[1180px]">
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
