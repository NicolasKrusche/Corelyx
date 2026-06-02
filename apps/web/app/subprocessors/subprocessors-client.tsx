"use client";

import { useState } from "react";
import Link from "next/link";
import type { Provider } from "@/lib/compliance/provider-registry";

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

export function SubprocessorsClient({
  providers,
  lastUpdated,
}: {
  providers: Provider[];
  lastUpdated: string;
}) {
  const [euOnly, setEuOnly] = useState(false);
  const shown = euOnly ? providers.filter((p) => p.eu_only_supported) : providers;

  return (
    <>
      {/* EU-first commitment banner */}
      <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary mb-2">Our commitment</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Corelyx is built for European users and runs under Austrian law and GDPR. Core infrastructure —
          database, web hosting, and workflow runtime — is deployed in EU regions. Where a provider
          cannot currently be configured EU-only (payments, transactional email, some AI model routing),
          we rely on signed DPAs and Standard Contractual Clauses as the transfer safeguard under{" "}
          <a
            href="https://gdpr-info.eu/art-46-gdpr/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Art. 46 GDPR
          </a>
          . We are actively working to reduce and eliminate non-EU processing over time.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          See{" "}
          <Link href="/privacy#transfers" className="text-primary hover:underline">
            Section 8 of our Privacy Policy
          </Link>{" "}
          for the full breakdown.
        </p>
      </div>

      {/* Filter toggle */}
      <div className="mb-4 flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {providers.length} providers
        </p>
        <button
          type="button"
          onClick={() => setEuOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            euOnly
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${euOnly ? "bg-primary" : "bg-muted-foreground/40"}`}
          />
          EU-only supported
        </button>
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
              {shown.map((provider) => (
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
                  <td className="px-4 py-4 align-top">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        provider.eu_only_supported
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {yesNo(provider.eu_only_supported)}
                    </span>
                  </td>
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
        <p className="mt-2 text-sm text-muted-foreground">
          Last registry review: {lastUpdated}.
        </p>
      </section>
    </>
  );
}
