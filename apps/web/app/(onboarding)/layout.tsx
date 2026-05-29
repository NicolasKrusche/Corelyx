import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Welcome | Corelyx",
};

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      {/* Background only bleeds behind the dark sidebar; the white right panel is solid. */}
      <div className="app-bg-gradient pointer-events-none fixed inset-0 -z-10 bg-background" />
      <div className="orb-primary" aria-hidden="true" />
      <div className="orb-blue" aria-hidden="true" />
      {children}
    </div>
  );
}
