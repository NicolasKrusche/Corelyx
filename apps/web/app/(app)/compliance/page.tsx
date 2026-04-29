import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { EuComplianceCenter } from "@/components/eu-compliance-center";

export const metadata: Metadata = {
  title: "EU Compliance — Corelyx",
  description:
    "Submit GDPR data subject requests, download policies, review audit evidence, and exercise privacy rights for your Corelyx workspace.",
};

export default async function CompliancePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowMockUser =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_ALLOW_MOCK_USER === "true";

  if (!user && !allowMockUser) redirect("/login");

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          Privacy & Rights
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              EU Compliance Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              GDPR controls, data subject requests, policies, audit evidence, and
              regulatory references — all in one place.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <EuComplianceCenter variant="full" />
    </div>
  );
}
