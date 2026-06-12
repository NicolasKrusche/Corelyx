import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { hasFounderAccess } from "@/lib/admin-auth";
import { AdminTeamClient } from "./admin-team-client";

export const metadata: Metadata = { title: "Team — Admin" };

export default async function AdminTeamPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasFounderAccess(user.id, user.email))) redirect("/admin");

  return <AdminTeamClient />;
}
