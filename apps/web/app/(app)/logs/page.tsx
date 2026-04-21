import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { LogsClient } from "./logs-client";

export default async function LogsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <LogsClient />;
}
