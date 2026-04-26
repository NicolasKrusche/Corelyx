import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { AdminCodesClient } from "./admin-codes-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Code Manager — Corelyx Admin" };

export default async function AdminCodesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/dashboard");

  return <AdminCodesClient />;
}
