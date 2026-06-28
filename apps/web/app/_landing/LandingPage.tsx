import Link from "next/link";
import { legalIdentity } from "@/lib/legal";
import { SmoothScroll } from "./sections/SmoothScroll";
import { CinematicBackdrop } from "./sections/CinematicBackdrop";
import { ScrollProgress } from "./sections/ScrollProgress";
import { HeroSignalScene } from "./sections/HeroSignalScene";
import { SignalToNodesScene } from "./sections/SignalToNodesScene";
import { WorkflowGraphScene } from "./sections/WorkflowGraphScene";
import { WorkflowBuilderScene } from "./sections/WorkflowBuilderScene";
import { GovernanceLayerScene } from "./sections/GovernanceLayerScene";
import { CredentialVaultScene } from "./sections/CredentialVaultScene";
import { ApprovalGateScene } from "./sections/ApprovalGateScene";
import { AuditEvidenceScene } from "./sections/AuditEvidenceScene";
import { IntegrationsOrbitScene } from "./sections/IntegrationsOrbitScene";
import { UseCaseTemplatesScene } from "./sections/UseCaseTemplatesScene";
import { TrustLayerScene } from "./sections/TrustLayerScene";
import { FinalSystemRevealScene } from "./sections/FinalSystemRevealScene";

const NAV_LINKS = [
  { label: "Platform", href: "#platform" },
  { label: "Workflows", href: "#workflows" },
  { label: "Security", href: "#security" },
  { label: "Compliance", href: "#compliance" },
  { label: "Trust", href: "#trust" },
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
    <header className="fixed inset-x-0 top-0 z-[60] border-b border-white/[0.06] bg-[#05060a]/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="#top" className="flex items-center gap-2.5">
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
          <a
            href="mailto:support@corelyx.app?subject=Book%20a%20Corelyx%20demo"
            className="inline-flex h-8 items-center rounded-full bg-[#f05a28] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Book a demo
          </a>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-[#05060a] px-5 py-14 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pictures/logo-no-bg.png" alt="" aria-hidden className="h-5 w-5 object-contain opacity-70" />
              <span className="text-sm font-semibold">Corelyx</span>
            </div>
            <p className="mt-3 max-w-[240px] text-sm leading-6 text-white/45">
              AI workflow automation built for GDPR and the EU AI Act.
            </p>
            <p className="mt-4 text-xs text-white/35">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/austria-heart-removebg.png" alt="Austria" className="mr-1 inline-block h-3 w-auto" />
              Built in Austria · EU-first infrastructure
            </p>
            <a
              href="https://instagram.com/corelyx"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-colors hover:text-white"
              aria-label="Corelyx on Instagram"
            >
              <InstagramIcon className="h-4 w-4" />
            </a>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={`${col.title} links`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-white/55 transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6">
          <p className="text-xs text-white/35">
            &copy; {new Date().getFullYear()} {legalIdentity.entityName}. All rights reserved.
          </p>
          <p className="max-w-3xl text-xs leading-5 text-white/35">
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
    // `dark` scopes the cinematic dark theme; the brand orange accent is inherited.
    <div className="dark relative overflow-x-hidden bg-[#05060a] text-white">
      <CinematicBackdrop />
      <ScrollProgress />
      <SiteHeader />
      <SmoothScroll>
        <main className="relative z-10">
          <HeroSignalScene />
          <SignalToNodesScene />
          <WorkflowGraphScene />
          <WorkflowBuilderScene />
          <GovernanceLayerScene />
          <CredentialVaultScene />
          <ApprovalGateScene />
          <AuditEvidenceScene />
          <IntegrationsOrbitScene />
          <UseCaseTemplatesScene />
          <TrustLayerScene />
          <FinalSystemRevealScene />
        </main>
      </SmoothScroll>
      <SiteFooter />
    </div>
  );
}
