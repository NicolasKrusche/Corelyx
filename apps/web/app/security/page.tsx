import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How to report security vulnerabilities to Corelyx, expected response timelines, and an overview of the platform's security architecture.",
  alternates: { canonical: "https://www.corelyx.app/security" },
  openGraph: { url: "https://www.corelyx.app/security" },
};

const timeline = [
  ["Acknowledgement", "Within 2 business days"],
  ["Initial triage and severity assessment", "Within 5 business days"],
  ["Status update cadence during fix", "At least every 7 days"],
  ["Coordinated public disclosure", "Typically within 90 days"],
] as const;

const severities = [
  ["Critical", "24 hours", "Remote code execution, auth bypass, cross-tenant data access"],
  ["High", "7 days", "Privilege escalation, secret exposure, stored XSS in privileged paths"],
  ["Medium", "30 days", "Reflected XSS, missing rate limits, non-sensitive information disclosure"],
  ["Low", "90 days", "Verbose errors, deprecated headers, minor hardening"],
] as const;

const toms = [
  ["Access control", "Workspace roles, program-level access checks, server-side credential retrieval, and least-privilege internal endpoints."],
  ["Encryption and secrets", "TLS in transit, provider-managed encryption at rest, Vault-backed secret references, and no OAuth token return in frontend responses."],
  ["Logging and retention", "Execution metadata is minimised by default, secrets are redacted, hashes are used for sensitive payload evidence, and retention jobs purge expired data."],
  ["Secure development", "Schema validation, request-body validation, branch/PR review practices, dependency scanning, and focused tests for schema translation and security-sensitive flows."],
  ["Incident handling", "Severity-based response targets, private vulnerability intake, and customer breach notification procedures documented in the incident response materials."],
] as const;

export default async function SecurityPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LegalPageHeader maxWidthClass="max-w-4xl" />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-10">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Security
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Security Policy
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated: 28 April 2026
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Report a vulnerability</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            If you believe you have found a vulnerability, report it privately to{" "}
            <a href="mailto:security@corelyx.app" className="text-primary hover:underline">
              security@corelyx.app
            </a>
            . Do not open a public issue, post details publicly, or exploit the issue beyond what is necessary to confirm it.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Description of the issue and potential impact</li>
            <li>Steps to reproduce or proof-of-concept code</li>
            <li>Affected endpoints, versions, or environments</li>
            <li>Your contact information and whether you want public credit</li>
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Coordinated disclosure</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We will not pursue legal action against researchers who act in good faith, avoid privacy violations and service disruption, report privately, allow reasonable time to fix, do not exfiltrate or modify customer data, and avoid denial-of-service, social engineering, or physical attacks.
          </p>
          <div className="mt-4 divide-y divide-border/70">
            {timeline.map(([stage, target]) => (
              <div key={stage} className="grid gap-2 py-3 sm:grid-cols-[260px_1fr]">
                <p className="text-sm font-medium text-foreground">{stage}</p>
                <p className="text-sm text-muted-foreground">{target}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Security overview and TOMs</h2>
          <div className="mt-4 divide-y divide-border/70">
            {toms.map(([title, body]) => (
              <div key={title} className="grid gap-2 py-3 sm:grid-cols-[180px_1fr]">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Assurance and certification status</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Corelyx is not currently ISO 27001 or SOC 2 certified. We are
            evaluating external certification as part of our enterprise
            readiness roadmap.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            No completed third-party penetration test report is currently
            published. External penetration testing, ISO 27001, SOC 2, and ISO
            42001 are tracked as enterprise readiness roadmap items.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Corelyx is voluntarily aligned with NIS2 Article 21 security
            measures and maintains CISPE self-assessment evidence in the
            repository. These are not third-party certifications.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Status and uptime</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Public status page is planned. Until it is live, incident and uptime
            notices are handled through customer support channels. The internal
            service target is documented as a roadmap control, not as a formal
            SLA unless separately agreed in writing.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Severity and patch targets</h2>
          <div className="mt-4 divide-y divide-border/70">
            {severities.map(([severity, sla, examples]) => (
              <div key={severity} className="grid gap-2 py-3 sm:grid-cols-[120px_120px_1fr]">
                <p className="text-sm font-medium text-foreground">{severity}</p>
                <p className="text-sm text-muted-foreground">{sla}</p>
                <p className="text-sm text-muted-foreground">{examples}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Scope</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-foreground">In scope</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li><code>*.corelyx.app</code> web and API surfaces</li>
                <li>Corelyx repositories under <code>github.com/corelyx</code></li>
                <li>Hosted Corelyx workflow runtime endpoints</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Out of scope</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Third-party service findings</li>
                <li>Automated tool output without manual verification</li>
                <li>Best-practice deviations without a concrete attack vector</li>
                <li>Physical access, social engineering, or attacks against staff</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border/40 px-6 py-6">
        <div className="mx-auto flex max-w-4xl items-center gap-5 text-xs text-muted-foreground/60">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/dpa" className="hover:text-foreground">DPA</Link>
        </div>
      </footer>
    </div>
  );
}
