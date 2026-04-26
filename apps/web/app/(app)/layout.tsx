import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { isAdminEmail } from "@/lib/admin";
import { WelcomeOfferBanner } from "@/components/welcome-offer-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier, plan_expires_at, is_beta_tester, display_name, avatar_url, created_at")
    .eq("id", user.id)
    .single();

  const isOAuthUser = !user.identities?.some((i) => i.provider === "email");

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isAdmin={isAdminEmail(user.email)}
        email={user.email ?? ""}
        tier={(isAdminEmail(user.email) ? "unlimited" : (profile?.tier ?? "free")) as "free" | "pro" | "builder" | "unlimited"}
        planExpiresAt={profile?.plan_expires_at ?? null}
        isBetaTester={profile?.is_beta_tester ?? false}
        userId={user.id}
        createdAt={profile?.created_at ?? user.created_at}
        initialDisplayName={profile?.display_name ?? ""}
        initialAvatarUrl={profile?.avatar_url ?? ""}
        isOAuthUser={isOAuthUser}
      />
      <main className="relative ml-16 min-h-screen px-6 py-6 lg:px-8 lg:py-8">
        <div className="app-bg-gradient pointer-events-none fixed inset-0 -z-10 bg-background" />
        <div className="mx-auto w-full max-w-[1180px]">
          <WelcomeOfferBanner
            createdAt={profile?.created_at ?? user.created_at}
            tier={profile?.tier ?? "free"}
          />
          {children}
        </div>
      </main>
    </div>
  );
}
