import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";
import {
  LEGAL_LAST_UPDATED,
  connectedServices,
  coreServiceProviders,
  modelProviders,
  type ProcessorEntry,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Subprocessors",
  description:
    "Public subprocessor registry for Corelyx infrastructure, connected services, and optional AI model providers.",
  alternates: { canonical: "https://corelyx.app/subprocessors" },
  openGraph: { url: "https://corelyx.app/subprocessors" },
};

function RegistrySection({
  title,
  description,
  entries,
}: {
  title: string;
  description: string;
  entries: ProcessorEntry[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
        <div className="grid grid-cols-12 border-b border-border bg-muted/40 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span className="col-span-3">Service</span>
          <span className="col-span-3">Purpose</span>
          <span className="col-span-3">Data processed</span>
          <span className="col-span-3">Location / transfer notes</span>
        </div>
        {entries.map((entry) => (
          <div
            key={entry.name}
            className="grid grid-cols-1 gap-3 border-b border-border/70 px-4 py-4 text-sm last:border-b-0 md:grid-cols-12"
          >
            <div className="md:col-span-3">
              <p className="font-semibold text-foreground">{entry.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{entry.activation}</p>
            </div>
            <p className="leading-relaxed text-muted-foreground md:col-span-3">
              {entry.purpose}
            </p>
            <p className="leading-relaxed text-muted-foreground md:col-span-3">
              {entry.categories}
            </p>
            <div className="space-y-2 leading-relaxed text-muted-foreground md:col-span-3">
              <p>{entry.dataLocation}</p>
              <p>{entry.transferNotes}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function SubprocessorsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-dots opacity-15" />
      </div>

      <LegalPageHeader maxWidthClass="max-w-6xl" />

      <main className="relative mx-auto max-w-6xl px-6 py-16">
        <div className="mb-12">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Legal
          </p>
          <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-5xl">
            Subprocessor Registry
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Last updated: {LEGAL_LAST_UPDATED}. This registry lists providers
            that may process personal data to operate Corelyx or to execute
            workflows you explicitly configure.
          </p>
        </div>

        <div className="space-y-12">
          <RegistrySection
            title="Core Service Providers"
            description="Providers used to run Corelyx itself."
            entries={coreServiceProviders}
          />
          <RegistrySection
            title="Connected Services"
            description="Providers contacted only when you connect the relevant service or include it in a workflow."
            entries={connectedServices}
          />
          <RegistrySection
            title="Model Providers"
            description="Optional AI providers used only when selected or configured for a workflow."
            entries={modelProviders}
          />
        </div>
      </main>

      <footer className="mt-16 border-t border-border/40 px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground/50 sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Corelyx. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link href="/dpa" className="transition-colors hover:text-foreground">
              DPA
            </Link>
            <Link href="/security" className="transition-colors hover:text-foreground">
              Security
            </Link>
            <Link href="/impressum" className="transition-colors hover:text-foreground">
              Impressum
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
