import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings — Nexflow",
};

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Detect if user signed up via OAuth (no password set)
  const isOAuthUser = !user.identities?.some((i) => i.provider === "email");

  return (
    <SettingsClient
      email={user.email ?? ""}
      isOAuthUser={isOAuthUser}
      createdAt={user.created_at}
    />
  );
}
