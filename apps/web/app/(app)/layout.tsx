import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { isAdminEmail } from "@/lib/admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier, plan_expires_at, is_beta_tester")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isAdmin={isAdminEmail(user.email)}
        email={user.email ?? ""}
        tier={(profile?.tier ?? "free") as "free" | "pro" | "builder" | "unlimited"}
        planExpiresAt={profile?.plan_expires_at ?? null}
        isBetaTester={profile?.is_beta_tester ?? false}
      />
      <main className="ml-56 min-h-screen p-8 relative">
        {/* Subtle ambient gradient — top right */}
        <div
          className="pointer-events-none fixed top-0 right-0 w-[700px] h-[500px] -z-10"
          style={{ background: "radial-gradient(ellipse at 100% 0%, rgba(249,115,22,0.04) 0%, transparent 60%)" }}
        />
        {children}
      </main>
    </div>
  );
}
