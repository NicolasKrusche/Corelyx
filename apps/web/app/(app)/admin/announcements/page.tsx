import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { GenesisReleaseAdmin } from "@/components/admin/genesis-release-admin";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasTechnicalAccess(user.id, user.email))) redirect("/admin");

  return <GenesisReleaseAdmin />;
}
