import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";
import { registryForPublicTables } from "@/lib/compliance/provider-registry";
import { LEGAL_LAST_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Subprocessors",
  description:
    "Structured Corelyx subprocessor registry with provider purpose, data categories, region, EU-only support, transfer basis, DPA and SCC status, retention notes, and activation status.",
  alternates: { canonical: "https://www.corelyx.app/subprocessors" },
  openGraph: { url: "https://www.corelyx.app/subprocessors" },
};

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

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

        <section className="overflow-hidden rounded-lg border border-border bg-card/60">
          <div className="overflow-x-auto">
            <table className="min-w-[1320px] text-left text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Purpose</th>
                  <th className="px-4 py-3">Data categories</th>
                  <th className="px-4 py-3">Region</th>
                  <th className="px-4 py-3">EU-only</th>
                  <th className="px-4 py-3">Transfer basis</th>
                  <th className="px-4 py-3">DPA</th>
                  <th className="px-4 py-3">SCC</th>
                  <th className="px-4 py-3">Retention</th>
                  <th className="px-4 py-3">Optional</th>
                  <th className="px-4 py-3">Default use</th>
                  <th className="px-4 py-3">Last reviewed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {providers.map((provider) => (
                  <tr key={provider.id}>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-foreground">{provider.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{provider.category}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{provider.activation}</p>
                    </td>
                    <td className="px-4 py-4 align-top text-muted-foreground">{provider.purpose}</td>
                    <td className="px-4 py-4 align-top text-muted-foreground">
                      {provider.data_categories_processed.join(", ")}
                    </td>
                    <td className="px-4 py-4 align-top text-muted-foreground">{provider.default_region}</td>
                    <td className="px-4 py-4 align-top">{yesNo(provider.eu_only_supported)}</td>
                    <td className="px-4 py-4 align-top text-muted-foreground">{provider.transfer_basis}</td>
                    <td className="px-4 py-4 align-top">
                      {provider.dpa_available ? "Available" : "Missing / customer review required"}
                    </td>
                    <td className="px-4 py-4 align-top">
                      {provider.scc_available ? "Available where needed" : "Missing / required before use"}
                    </td>
                    <td className="px-4 py-4 align-top text-muted-foreground">{provider.retention_notes}</td>
                    <td className="px-4 py-4 align-top">{provider.optional ? "Optional" : "Required"}</td>
                    <td className="px-4 py-4 align-top">{provider.used_by_default ? "Default" : "Customer enabled"}</td>
                    <td className="px-4 py-4 align-top">{provider.last_reviewed_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-border bg-card/60 p-6">
          <h2 className="text-base font-semibold text-foreground">Change notice</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Corelyx will provide at least 30 days advance notice before adding
            or replacing a subprocessor that processes customer personal data,
            unless urgent security, availability, or legal requirements make
            advance notice impracticable.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            See the{" "}
            <Link href="/dpa" className="text-primary hover:underline">DPA</Link>{" "}
            and{" "}
            <Link href="/data-residency" className="text-primary hover:underline">Data Residency</Link>{" "}
            pages for processor terms and regional controls.
          </p>
        </section>
      </main>
    </div>
  );
}
