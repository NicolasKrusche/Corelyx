import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasFounderAccess } from "@/lib/admin-auth";
import { AdminCodesClient } from "./admin-codes-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Code Manager — Corelyx Admin" };

export default async function AdminCodesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasFounderAccess(user.id, user.email))) redirect("/admin");

  return <AdminCodesClient />;
}
