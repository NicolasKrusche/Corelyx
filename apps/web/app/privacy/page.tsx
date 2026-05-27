import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";
import {
  LEGAL_LAST_UPDATED,
  connectedServices,
  coreServiceProviders,
  dataCategories,
  legalBases,
  legalIdentity,
  modelProviders,
  privacyContactEmail,
  retentionItems,
  rightsItems,
  type ProcessorEntry,
  type TextItem,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Corelyx processes personal data, including its processor inventory, legal bases, and data transfer notes.",
  alternates: { canonical: "https://www.corelyx.app/privacy" },
  openGraph: { url: "https://www.corelyx.app/privacy" },
};

const sections = [
  { id: "overview", title: "1. Overview" },
  { id: "controller", title: "2. Controller" },
  { id: "categories", title: "3. Data Categories" },
  { id: "legal-bases", title: "4. Legal Bases" },
  { id: "core-processors", title: "5. Core Processors" },
  { id: "connected-services", title: "6. Connected Services" },
  { id: "model-providers", title: "7. Model Providers" },
  { id: "transfers", title: "8. International Transfers" },
  { id: "retention", title: "9. Retention" },
  { id: "security", title: "10. Security" },
  { id: "rights", title: "11. Your Rights" },
  { id: "cookies", title: "12. Cookies and Local Storage" },
  { id: "contact", title: "13. Contact" },
];

function TextCard({ item }: { item: TextItem }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {item.body}
      </p>
    </div>
  );
}

function ProcessorCard({ entry }: { entry: ProcessorEntry }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {entry.name}
          </h3>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            {entry.role}
          </p>
        </div>
        <span className="inline-flex rounded-full border border-border bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
          {entry.activation}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Purpose
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {entry.purpose}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Legal Basis
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {entry.legalBasis}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Data Categories
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {entry.categories}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Data Location
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {entry.dataLocation}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border/70 bg-background/50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          Transfer Notes
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {entry.transferNotes}
        </p>
        {entry.notes ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {entry.notes}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default async function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-dots opacity-15" />
        <div
          className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse, hsl(var(--primary) / 0.07) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      </div>

      <LegalPageHeader maxWidthClass="max-w-5xl" />

      <main className="relative mx-auto max-w-5xl px-6 py-16">
        <div className="mb-12">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Legal
          </p>
          <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Last updated: {LEGAL_LAST_UPDATED}
          </p>
        </div>

        <div className="flex gap-12">
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-24 space-y-1">
              <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                Contents
              </p>
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-lg px-3 py-1.5 text-xs leading-snug text-muted-foreground/60 transition-all duration-150 hover:bg-accent hover:text-foreground"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-10">
            <section id="overview" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                1. Overview
              </h2>
              <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Corelyx is a visual AI automation platform. This policy
                  explains how we process personal data when you create an
                  account, configure workflows, connect third-party services,
                  add model or API credentials, purchase a paid plan, or contact
                  us about the product.
                </p>
                <p>
                  We do not sell personal data. We also do not load advertising
                  trackers or non-essential analytics on the current site
                  experience.
                </p>
                <p>
                  This page separates:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    core processors we engage to operate Corelyx itself, and
                  </li>
                  <li>
                    optional connected services and model providers that only
                    receive data when you explicitly enable them in a workflow.
                  </li>
                </ul>
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="controller" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                2. Controller
              </h2>
              <div className="rounded-2xl border border-border bg-card/60 p-6 text-sm leading-relaxed text-muted-foreground">
                <p>
                  The controller for the Corelyx service is{" "}
                  <span className="font-semibold text-foreground">
                    {legalIdentity.entityName}
                  </span>
                  .
                </p>
                <p className="mt-3">
                  Full provider-identification details, including the current
                  legal address and VAT information used for the public site, are
                  published in the{" "}
                  <Link href="/impressum" className="text-primary hover:underline">
                    Impressum
                  </Link>
                  .
                </p>
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="categories" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                3. Data Categories
              </h2>
              <div className="grid gap-4">
                {dataCategories.map((item) => (
                  <TextCard key={item.title} item={item} />
                ))}
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="legal-bases" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                4. Legal Bases
              </h2>
              <div className="grid gap-4">
                {legalBases.map((item) => (
                  <TextCard key={item.title} item={item} />
                ))}
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="core-processors" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                5. Core Processors
              </h2>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                These providers operate the Corelyx product itself. They process
                personal data on our behalf so we can host the application, run
                workflows, send transactional notifications, and handle billing.
              </p>
              <div className="grid gap-5">
                {coreServiceProviders.map((entry) => (
                  <ProcessorCard key={entry.name} entry={entry} />
                ))}
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="connected-services" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                6. Connected Services
              </h2>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                These services are only contacted if you connect them and build
                workflows that use them. Depending on the service and your own
                agreement with that service, the connected provider may act as an
                independent controller, a processor for your organization, or
                both.
              </p>

              <div className="mb-5 rounded-2xl border border-border bg-card/60 p-5 text-sm leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground">
                  Google API Services notice
                </p>
                <p className="mt-2">
                  If you connect Google services, Corelyx uses Google user data
                  only to provide the Google-backed features you configure. We do
                  not use Google user data for advertising or to train general
                  AI models. You can revoke Google access in your Google account
                  permissions or by disconnecting the integration in Corelyx.
                </p>
              </div>

              <div className="grid gap-5">
                {connectedServices.map((entry) => (
                  <ProcessorCard key={entry.name} entry={entry} />
                ))}
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="model-providers" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                7. Model Providers
              </h2>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                These providers are optional. Corelyx only sends prompts,
                workflow context, and selected inputs to them if you add the
                relevant API key or choose that provider inside a workflow.
              </p>
              <div className="grid gap-5">
                {modelProviders.map((entry) => (
                  <ProcessorCard key={entry.name} entry={entry} />
                ))}
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="transfers" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                8. International Transfers
              </h2>
              <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Many infrastructure, billing, email, and AI providers used by
                  or through Corelyx are based in the United States or use global
                  infrastructure. That means personal data may be transferred
                  outside the EEA, the UK, or Switzerland.
                </p>
                <p>
                  Where required, these transfers should be covered by provider
                  DPAs, Standard Contractual Clauses, Data Privacy Framework
                  participation where applicable, or equivalent safeguards. The
                  exact transfer path depends on the providers you enable and the
                  regions configured in those third-party accounts.
                </p>
                <p>
                  The exact transfer path depends on the services you enable,
                  the provider contracts in place, and the regions configured in
                  those third-party accounts.
                </p>
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="retention" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                9. Retention
              </h2>
              <div className="grid gap-4">
                {retentionItems.map((item) => (
                  <TextCard key={item.title} item={item} />
                ))}
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="security" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                10. Security
              </h2>
              <div className="rounded-2xl border border-border bg-card/60 p-6 text-sm leading-relaxed text-muted-foreground">
                <ul className="list-disc space-y-2 pl-5">
                  <li>Traffic to the product is encrypted in transit with TLS.</li>
                  <li>
                    OAuth tokens and API keys are stored through Supabase Vault
                    references and are not returned to the browser in normal API
                    responses.
                  </li>
                  <li>
                    Workflow ownership checks and row-level access controls are
                    used to keep users scoped to their own resources.
                  </li>
                  <li>
                    We minimize sensitive logging in the web layer and continue
                    tightening deletion and retention flows where the audit found
                    gaps.
                  </li>
                </ul>
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="rights" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                11. Your Rights
              </h2>
              <div className="grid gap-4">
                {rightsItems.map((item) => (
                  <TextCard key={item.title} item={item} />
                ))}
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="cookies" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                12. Cookies and Local Storage
              </h2>
              <div className="rounded-2xl border border-border bg-card/60 p-6 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Corelyx currently uses cookies and local storage only for
                  essential session handling and interface preferences such as
                  theme selection. We do not currently load advertising trackers
                  or non-essential analytics on the site.
                </p>
                <p className="mt-3">
                  Because the current site experience only uses essential
                  authentication cookies and saved preferences, the site shows an
                  informational notice rather than an opt-in marketing or
                  analytics banner.
                </p>
              </div>
              <div className="mt-8 border-t border-border/30" />
            </section>

            <section id="contact" className="scroll-mt-24">
              <h2 className="mb-4 text-lg font-bold text-foreground">
                13. Contact
              </h2>
              <div className="rounded-2xl border border-border bg-card/60 p-6 text-sm leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground">
                  Privacy requests and security issues
                </p>
                <p className="mt-2">
                  Email us at{" "}
                  <a
                    href={`mailto:${privacyContactEmail}`}
                    className="text-primary hover:underline"
                  >
                    {privacyContactEmail}
                  </a>
                  . For general legal contact details, see the{" "}
                  <Link href="/impressum" className="text-primary hover:underline">
                    Impressum
                  </Link>
                  .
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="mt-16 border-t border-border/40 px-6 py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground/50 sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Corelyx. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link
              href="/privacy"
              className="font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              href="/dpa"
              className="transition-colors hover:text-foreground"
            >
              DPA
            </Link>
            <Link
              href="/security"
              className="transition-colors hover:text-foreground"
            >
              Security
            </Link>
            <Link
              href="/impressum"
              className="transition-colors hover:text-foreground"
            >
              Impressum
            </Link>
            <Link
              href="/login"
              className="transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
