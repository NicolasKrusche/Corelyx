import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings — Corelyx",
};

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Compatibility route: keep old /settings links working by opening the sidebar popup.
  redirect("/dashboard?settings=1");
}
