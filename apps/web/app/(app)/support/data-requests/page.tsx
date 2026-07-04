import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { DataRequestsClient } from "./data-requests-client";

export const metadata: Metadata = { title: "Data Requests" };

export default async function DataRequestsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="mb-1 text-[11px] text-muted-foreground/60">
          <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
          {" / "}
          <span>Data Requests</span>
        </p>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Your data requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track the status of your GDPR data subject requests and provide follow-up information when asked.
        </p>
      </div>
      <DataRequestsClient userEmail={user.email ?? ""} />
    </div>
  );
}
