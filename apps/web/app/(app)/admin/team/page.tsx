import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { isAdminEmail } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { AdminTeamClient } from "./admin-team-client";

export const metadata: Metadata = { title: "Team - Corelyx Admin" };

export default async function AdminTeamPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/dashboard");

  return <AdminTeamClient />;
}
