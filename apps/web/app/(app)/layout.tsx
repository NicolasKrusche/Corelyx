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
        tier={(isAdminEmail(user.email) ? "unlimited" : (profile?.tier ?? "free")) as "free" | "pro" | "builder" | "unlimited"}
        planExpiresAt={profile?.plan_expires_at ?? null}
        isBetaTester={profile?.is_beta_tester ?? false}
      />
      <main className="relative ml-16 min-h-screen px-6 py-6 lg:px-8 lg:py-8">
        <div
          className="pointer-events-none fixed inset-0 -z-10 bg-background"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 85% 0%, rgba(79,70,229,0.06) 0%, transparent 45%), radial-gradient(ellipse at 20% 100%, rgba(99,102,241,0.04) 0%, transparent 40%)",
          }}
        />
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
