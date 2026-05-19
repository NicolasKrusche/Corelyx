import { redirect } from "next/navigation";
import Link from "next/link";
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
      <Link
        href="/support/data-requests"
        className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 hover:bg-accent transition-colors"
      >
        <div>
          <p className="font-semibold text-sm">GDPR data requests</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            View your data subject requests and provide follow-up information.
          </p>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-muted-foreground">
          <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </Link>

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
