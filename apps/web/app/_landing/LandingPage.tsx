import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  FileCheck2,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { legalIdentity } from "@/lib/legal";
import { CinematicHero } from "@/components/ui/cinematic-landing-hero";

const NAV_LINKS = [
  { label: "Compliance", href: "#compliance" },
  { label: "Integrations", href: "/integrations" },
  { label: "Security", href: "/security" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
];

const GOVERNANCE = [
  {
    icon: ClipboardList,
    title: "Automatic AI inventory",
    body: "Every workflow becomes an AI system record — purpose, owners, models, data sources, and risk — kept current as you build.",
  },
  {
    icon: Scale,
    title: "EU AI Act risk classification",
    body: "Each workflow is risk-classified with recommended controls and approval gates on high-impact steps, before anything runs.",
  },
  {
    icon: FileCheck2,
    title: "Generated evidence & DPIA",
    body: "Technical documentation, DPIA drafts, and governance exports are generated from the product — not scattered across spreadsheets.",
  },
  {
    icon: ShieldCheck,
    title: "Audit-ready trail",
    body: "Runs, approvals, overrides, and outcomes produce a searchable record for audits and incident review.",
  },
];

const COMPLIANCE_LINKS = [
  { label: "GDPR", href: "/gdpr" },
  { label: "EU AI Act", href: "/ai-act" },
  { label: "Compliance overview", href: "/compliance" },
  { label: "DPA", href: "/dpa" },
  { label: "Subprocessors", href: "/subprocessors" },
  { label: "DPIA template", href: "/dpia-template" },
  { label: "Data export schema", href: "/data-export-schema" },
  { label: "Data residency", href: "/data-residency" },
  { label: "Security", href: "/security" },
  { label: "Trust center", href: "/trust" },
];

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Integrations", href: "/integrations" },
      { label: "Use cases", href: "/use-cases" },
      { label: "Templates", href: "/templates" },
      { label: "Compare", href: "/compare" },
      { label: "Pricing", href: "/pricing" },
      { label: "Docs", href: "/docs" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    title: "Compliance",
    links: [
      { label: "GDPR", href: "/gdpr" },
      { label: "EU AI Act", href: "/ai-act" },
      { label: "Compliance", href: "/compliance" },
      { label: "Security", href: "/security" },
      { label: "Trust Center", href: "/trust" },
      { label: "Data residency", href: "/data-residency" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "DPA", href: "/dpa" },
      { label: "Subprocessors", href: "/subprocessors" },
      { label: "DPIA template", href: "/dpia-template" },
      { label: "Data export schema", href: "/data-export-schema" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Impressum", href: "/impressum" },
    ],
  },
];

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-[60] border-b border-white/[0.06] bg-[#07080a]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pictures/logo-no-bg.png" alt="Corelyx" className="h-6 w-6 object-contain" />
          <span className="text-sm font-semibold text-white">Corelyx</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-white/50 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm text-white/50 transition-colors hover:text-white sm:block">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-8 items-center rounded-full bg-[#f05a28] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

function ComplianceSection() {
  return (
    <section
      id="compliance"
      className="relative scroll-mt-16 overflow-hidden bg-[#08090d] px-5 py-24 text-white sm:px-8 sm:py-32"
    >
      {/* Soft orange glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[#f05a28]/[0.07] blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Heading */}
        <div className="max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f05a28]">
            <ShieldCheck className="h-3.5 w-3.5" />
            EU-native · Compliance-first
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            GDPR and the EU AI Act, handled by default.
          </h2>
          <p className="mt-4 text-base leading-7 text-white/50">
            Compliance isn&apos;t a checkbox you bolt on later. Corelyx inventories,
            classifies, documents, and audits every AI workflow as you build —
            on EU-hosted infrastructure, with credentials that never leave the server.
          </p>
        </div>

        {/* Governance points — editorial 2-col, no card chrome */}
        <div className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {GOVERNANCE.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex gap-4 border-t border-white/10 pt-6">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#f05a28]" strokeWidth={1.75} />
                <div>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-white/45">{item.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Documentation links */}
        <div className="mt-14 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Compliance documentation</p>
              <p className="mt-1 text-sm text-white/45">
                Everything procurement, privacy, and security teams ask for.
              </p>
            </div>
            <Link
              href="/trust"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#f05a28] transition-colors hover:text-[#ff7a4d]"
            >
              Visit the Trust Center
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {COMPLIANCE_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-sm text-white/70 transition-colors hover:border-[#f05a28]/40 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f05a28] px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Start for free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-11 items-center rounded-full border border-white/15 px-6 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            View pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background px-5 py-14 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pictures/logo-no-bg.png" alt="" aria-hidden className="h-5 w-5 object-contain opacity-70" />
              <span className="text-sm font-semibold">Corelyx</span>
            </div>
            <p className="mt-3 max-w-[240px] text-sm leading-6 text-muted-foreground">
              AI workflow automation built for GDPR and the EU AI Act.
            </p>
            <p className="mt-4 text-xs text-muted-foreground/70">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/austria-heart-removebg.png" alt="Austria" className="mr-1 inline-block h-3 w-auto" />
              Built in Austria · EU-first infrastructure
            </p>
            <a
              href="https://instagram.com/corelyx"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Corelyx on Instagram"
            >
              <InstagramIcon className="h-4 w-4" />
            </a>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={`${col.title} links`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                {col.title}
              </p>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Legal identity */}
        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground/70">
            &copy; {new Date().getFullYear()} {legalIdentity.entityName}. All rights reserved.
          </p>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground/70">
            Contracting entity: {legalIdentity.contractingEntity}. Responsible person:{" "}
            {legalIdentity.representative}.{" "}
            {legalIdentity.addressLines.length > 0
              ? `Registered address: ${legalIdentity.addressLines.join(", ")}.`
              : "Registered address: see Impressum."}{" "}
            Governing law: {legalIdentity.applicableLaw}.{" "}
            <a href="mailto:support@corelyx.app" className="underline-offset-2 hover:underline">
              support@corelyx.app
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="overflow-x-hidden bg-background text-foreground">
      <SiteHeader />
      <CinematicHero />
      <ComplianceSection />
      <SiteFooter />
    </div>
  );
}
