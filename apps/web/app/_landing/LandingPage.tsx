import Link from "next/link";
import { legalIdentity } from "@/lib/legal";
import { CinematicHero } from "@/components/ui/cinematic-landing-hero";

const FOOTER_LINKS = [
  { label: "Pricing", href: "/pricing" },
  { label: "Security", href: "/security" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "DPA", href: "/dpa" },
  { label: "Subprocessors", href: "/subprocessors" },
  { label: "Impressum", href: "/impressum" },
  { label: "Sign in", href: "/login" },
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

export default function LandingPage() {
  return (
    <div className="overflow-x-hidden bg-background text-foreground">
      <CinematicHero />

      {/* Footer — kept for legally required links (Impressum, DPA, privacy). */}
      <footer className="border-t border-border bg-background px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pictures/logo-no-bg.png" alt="" aria-hidden className="h-5 w-5 object-contain opacity-70" />
                <span className="text-sm font-semibold">Corelyx</span>
              </div>
              <p className="mt-3 max-w-[240px] text-sm leading-6 text-muted-foreground">
                AI workflow automation built for GDPR compliance.
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

            {/* Links */}
            <nav aria-label="Footer">
              <ul className="grid grid-cols-2 gap-x-10 gap-y-2.5 sm:grid-cols-2">
                {FOOTER_LINKS.map((link) => (
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
          </div>

          {/* Legal identity */}
          <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6">
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
    </div>
  );
}
