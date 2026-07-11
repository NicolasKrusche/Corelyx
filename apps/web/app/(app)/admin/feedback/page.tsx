import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { AdminFeedbackClient } from "./admin-feedback-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Feedback — Admin" };

export default async function AdminFeedbackPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id, user.email ?? undefined))) redirect("/dashboard");

  return <AdminFeedbackClient />;
}
