import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
};

// /settings is the canonical deep-link for the settings modal. The sidebar
// (rendered by the (app) layout) detects this pathname and opens the modal on
// top of this page; closing it navigates back to /dashboard.
export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-2xl space-y-2">
      <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Manage your account, appearance, language, and notification preferences.
      </p>
    </div>
  );
}
