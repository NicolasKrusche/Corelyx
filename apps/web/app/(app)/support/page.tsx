import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { parseTier } from "@/lib/entitlements";
import { SettingsSupportTab } from "@/components/settings-support-tab";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support — Corelyx" };

export default async function SupportPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single();

  const tier = parseTier((profile as { tier?: string } | null)?.tier);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Support</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Open a ticket, track your conversations, or contact sales.
        </p>
      </div>
      <SettingsSupportTab
        tier={tier}
        userId={user.id}
        panelClass="rounded-2xl border border-border bg-card p-5"
        fieldClass="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        primaryBtnClass="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        neutralBtnClass="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-40"
      />
    </div>
  );
}
