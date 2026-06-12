import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { ConsentClient } from "./consent-client";

export const metadata = { title: "Terms & Privacy" };

type ConsentProfile = { legal_consented_at: string | null };

export default async function ConsentPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If already consented, send them to the dashboard
  const { data: profile } = await supabase
    .from("profiles")
    .select("legal_consented_at")
    .eq("id", user.id)
    .single();

  const p = profile as ConsentProfile | null;
  if (p?.legal_consented_at) redirect("/dashboard");

  return <ConsentClient />;
}
