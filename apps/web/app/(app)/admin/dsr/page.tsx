import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { isAdminEmail } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { AdminDsrClient } from "./admin-dsr-client";

export const metadata: Metadata = { title: "DSR Queue - Corelyx Admin" };

export default async function AdminDsrPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");

  if (!isAdminEmail(user.email)) {
    const service = createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("is_admin, team_role")
      .eq("id", user.id)
      .single();
    const p = profile as { is_admin: boolean; team_role: string | null } | null;
    if (!p?.is_admin || p.team_role !== "founder") redirect("/admin");
  }

  return <AdminDsrClient />;
}
