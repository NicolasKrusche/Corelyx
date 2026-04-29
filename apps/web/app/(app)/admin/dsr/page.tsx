import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { isAdminEmail } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { AdminDsrClient } from "./admin-dsr-client";

export const metadata: Metadata = { title: "DSR Queue - Corelyx Admin" };

export default async function AdminDsrPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/dashboard");

  return <AdminDsrClient />;
}
