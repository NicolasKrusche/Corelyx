import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { AdminTemplatesClient } from "./admin-templates-client";

export const metadata = {
  title: "Template Review — Admin",
};

async function getUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export default async function AdminTemplatesPage() {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/admin/templates");

  const supabase = await createServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, team_role")
    .eq("id", user.id)
    .single();

  const profileData = profile as { is_admin: boolean | null; team_role: string | null } | null;
  const isAdmin =
    isAdminEmail(user.email ?? undefined) || profileData?.is_admin === true;

  if (!isAdmin) redirect("/admin");

  return <AdminTemplatesClient />;
}
