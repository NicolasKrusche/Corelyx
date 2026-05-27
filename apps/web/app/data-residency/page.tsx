import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";
import {
  isProviderAllowedInEuOnly,
  providerLeavesEea,
  registryForPublicTables,
} from "@/lib/compliance/provider-registry";

export const metadata: Metadata = {
  title: "Data Residency",
  description:
    "Corelyx data residency matrix, EU-only mode boundaries, and transfer-basis notes for providers and workflow integrations.",
  alternates: { canonical: "https://www.corelyx.app/data-residency" },
  openGraph: { url: "https://www.corelyx.app/data-residency" },
};

export default function DataResidencyPage() {
  const providers = registryForPublicTables();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LegalPageHeader maxWidthClass="max-w-6xl" />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10 max-w-3xl">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Data residency
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            EU-first infrastructure with explicit transfer visibility.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Corelyx does not make a blanket claim that all data remains in the EU.
            EU-only mode can restrict storage, logs, model providers, and
            workflow execution to approved EU/EEA infrastructure for eligible
            workflows. Some connected services, model providers, email
            providers, analytics tools, or customer-selected integrations may
            process data outside the EEA. Corelyx shows this before activation.
          </p>
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card/60 p-5">
            <h2 className="text-sm font-semibold">Standard mode</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Allows customer-selected providers and integrations subject to
              the workflow checklist, DPA, SCC, and transfer-basis warnings.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card/60 p-5">
            <h2 className="text-sm font-semibold">EU-only mode</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Blocks providers that are not marked as EU-supported with DPA,
              SCC or transfer-basis evidence, and verified regional controls.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card/60 p-5">
            <h2 className="text-sm font-semibold">Customer-configured services</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Regional eligibility may depend on the customer account for Google,
              Microsoft, Slack, model-provider, or cloud-provider account.
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-card/60">
          <div className="border-b border-border px-4 py-4">
            <h2 className="text-lg font-bold">Residency matrix</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reviewed provider entries used by the public subprocessor registry
              and in-app compliance checks.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] text-left text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Purpose</th>
                  <th className="px-4 py-3">Default region</th>
                  <th className="px-4 py-3">EU-only support</th>
                  <th className="px-4 py-3">Leaves EEA</th>
                  <th className="px-4 py-3">Transfer basis</th>
                  <th className="px-4 py-3">Retention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {providers.map((provider) => (
                  <tr key={provider.id}>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-foreground">{provider.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{provider.category}</p>
                    </td>
                    <td className="px-4 py-4 align-top text-muted-foreground">{provider.purpose}</td>
                    <td className="px-4 py-4 align-top text-muted-foreground">{provider.default_region}</td>
                    <td className="px-4 py-4 align-top">
                      {isProviderAllowedInEuOnly(provider) ? "Eligible" : "Not eligible / needs review"}
                    </td>
                    <td className="px-4 py-4 align-top">
                      {providerLeavesEea(provider) ? "Possible" : "No obvious transfer"}
                    </td>
                    <td className="px-4 py-4 align-top text-muted-foreground">{provider.transfer_basis}</td>
                    <td className="px-4 py-4 align-top text-muted-foreground">{provider.retention_notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          For processor terms and subprocessor change notice, see the{" "}
          <Link href="/dpa" className="text-primary hover:underline">DPA</Link>{" "}
          and{" "}
          <Link href="/subprocessors" className="text-primary hover:underline">Subprocessors</Link>{" "}
          pages.
        </p>
      </main>
    </div>
  );
}
