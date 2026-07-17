import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";
import {
  LEGAL_LAST_UPDATED,
  legalIdentity,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Impressum",
  description: "Provider identification and contact information for the Corelyx website.",
  alternates: { canonical: "https://www.corelyx.app/impressum" },
  openGraph: { url: "https://www.corelyx.app/impressum" },
};

export default async function ImpressumPage() {
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

      <LegalPageHeader maxWidthClass="max-w-4xl" />

      <main className="relative mx-auto max-w-4xl px-6 py-16">
        <div className="mb-12">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Legal
          </p>
          <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-5xl">
            Impressum
          </h1>
          <p className="text-sm text-muted-foreground">
            Last updated: {LEGAL_LAST_UPDATED}
          </p>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card/60 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              Provider information according to DDG Section 5
            </p>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <div>
                <p className="font-semibold text-foreground">
                  {legalIdentity.entityName}
                </p>
                <p>Trading name / product: {legalIdentity.tradingName}</p>
                {legalIdentity.representative ? (
                  <p>Responsible person / managing director: {legalIdentity.representative}</p>
                ) : null}
                <p>Contracting entity for Terms, DPA, and invoices: {legalIdentity.contractingEntity}</p>
              </div>

              {legalIdentity.addressLines.length > 0 ? (
                <div>
                  <p className="font-semibold text-foreground">Registered address</p>
                  <div className="mt-1">
                    {legalIdentity.addressLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-foreground">Registered address</p>
                  <p>
                    Not configured in the public deployment environment. The
                    contracting address must be shown here before production
                    commercial launch and must match Terms, DPA, and invoice
                    records.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card/60 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              Contact
            </p>
            <div className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                Email:{" "}
                <a
                  href={`mailto:${legalIdentity.email}`}
                  className="text-primary hover:underline"
                >
                  {legalIdentity.email}
                </a>
              </p>
              <p>
                Security:{" "}
                <a
                  href={`mailto:${legalIdentity.securityEmail}`}
                  className="text-primary hover:underline"
                >
                  {legalIdentity.securityEmail}
                </a>
              </p>
              <p>
                Data protection contact:{" "}
                <a
                  href={`mailto:${legalIdentity.privacyEmail}`}
                  className="text-primary hover:underline"
                >
                  {legalIdentity.privacyEmail}
                </a>
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card/60 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              Company register
            </p>
            <div className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <p>Company register number: {legalIdentity.companyRegisterNo || "Not applicable"}</p>
              <p>Commercial court: {legalIdentity.commercialCourt || "Not applicable"}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card/60 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              VAT identification number
            </p>
            <div className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <p>VAT ID: {legalIdentity.vatId || "Not applicable"}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card/60 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              Regulatory authority
            </p>
            <div className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                {legalIdentity.supervisoryAuthority}. WKO reference:{" "}
                <a
                  href="https://www.wko.at"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  www.wko.at
                </a>
              </p>
              <p className="mt-1">Applicable law: {legalIdentity.applicableLaw}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card/60 p-6 text-sm leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">
              Related legal documents
            </p>
            <p className="mt-2">
              See our{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              for data-protection information and our{" "}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{" "}
              for product terms.
            </p>
          </section>
        </div>
      </main>

      <footer className="mt-16 border-t border-border/40 px-6 py-6">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground/50 sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Corelyx. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link
              href="/privacy"
              className="transition-colors hover:text-foreground"
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
              href="/impressum"
              className="font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
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
