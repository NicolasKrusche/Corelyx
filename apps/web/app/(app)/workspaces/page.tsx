import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { WorkspacesClient } from "./workspaces-client";

export const metadata: Metadata = { title: "Workspaces - Corelyx" };

export default async function WorkspacesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <WorkspacesClient />;
}
