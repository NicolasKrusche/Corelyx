import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { AdminSupportClient } from "./admin-support-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support Tickets — Admin" };

export default async function AdminSupportPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/dashboard");

  return <AdminSupportClient />;
}
