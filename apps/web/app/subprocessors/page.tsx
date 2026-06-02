import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";
import { registryForPublicTables, LAST_PROVIDER_REVIEWED_AT } from "@/lib/compliance/provider-registry";
import { LEGAL_LAST_UPDATED } from "@/lib/legal";
import { SubprocessorsClient } from "./subprocessors-client";

export const metadata: Metadata = {
  title: "Subprocessors",
  description:
    "Structured Corelyx subprocessor registry with provider purpose, data categories, region, EU-only support, transfer basis, DPA and SCC status, retention notes, and activation status.",
  alternates: { canonical: "https://www.corelyx.app/subprocessors" },
  openGraph: { url: "https://www.corelyx.app/subprocessors" },
};

export default function SubprocessorsPage() {
  const providers = registryForPublicTables();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LegalPageHeader maxWidthClass="max-w-7xl" />

      <main className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-12 max-w-3xl">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Legal
          </p>
          <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-5xl">
            Subprocessor Registry
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Last updated: {LEGAL_LAST_UPDATED}. This registry lists providers
            that may process personal data to operate Corelyx or execute
            workflows you explicitly configure. Customer-configured providers
            may require separate customer account settings, DPAs, SCCs, or
            transfer assessments.
          </p>
        </div>

        <SubprocessorsClient
          providers={providers}
          lastUpdated={LAST_PROVIDER_REVIEWED_AT}
        />
      </main>
    </div>
  );
}
