import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { TeamSettingsClient } from "@/components/team/TeamSettingsClient";

export const metadata: Metadata = {
  title: "Team Settings",
};

// Settings → Team. Manage team membership, roles, and collaboration.
export default async function TeamSettingsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-4xl">
      <TeamSettingsClient currentUserId={user.id} />
    </div>
  );
}
