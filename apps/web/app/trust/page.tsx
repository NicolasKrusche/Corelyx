import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";

export const metadata: Metadata = {
  title: "Trust Center",
  description:
    "Corelyx Trust Center for security, GDPR, data residency, subprocessors, AI Act readiness, and assurance status.",
  alternates: { canonical: "https://www.corelyx.app/trust" },
  openGraph: { url: "https://www.corelyx.app/trust" },
};

const links = [
  {
    href: "/security",
    title: "Security overview",
    body: "Technical and organisational measures, vulnerability disclosure, incident handling, and audit status.",
  },
  {
    href: "/dpa",
    title: "GDPR DPA",
    body: "Article 28 processor terms for business customers.",
  },
  {
    href: "/subprocessors",
    title: "Subprocessor registry",
    body: "Structured provider, purpose, region, DPA, SCC, retention, and transfer-basis information.",
  },
  {
    href: "/data-residency",
    title: "Data residency matrix",
    body: "EU-first infrastructure, EU-only mode boundaries, and known third-country transfer risks.",
  },
  {
    href: "/ai-act",
    title: "AI Act readiness",
    body: "Risk classification support, human oversight, transparency notices, audit logs, and exports.",
  },
  {
    href: "/privacy",
    title: "Privacy policy",
    body: "Controller notice, data categories, legal bases, transfers, retention, and rights.",
  },
  {
    href: "/impressum",
    title: "Impressum",
    body: "Legal identity, responsible contact, security contact, data-protection contact, and contracting entity.",
  },
  {
    href: "/dpia-template",
    title: "DPIA template",
    body: "A customer-facing template for higher-risk workflow assessments.",
  },
] as const;

const assurance = [
  ["ISO 27001 / SOC 2", "Corelyx is not currently ISO 27001 or SOC 2 certified. We are evaluating external certification as part of our enterprise readiness roadmap."],
  ["ISO 42001", "Not currently certified. AI management-system certification is being tracked as part of the external assurance roadmap."],
  ["Pen test / external audit", "No completed third-party penetration test is currently published. External testing is planned before enterprise commitments that require it."],
  ["CSA STAR / NIS2 / CISPE / Green Web", "Self-assessment documents are maintained in the repository and should be published only when evidence is complete and current."],
  ["Status page", "Public status page is planned. Until it is live, operational incidents are communicated through customer support channels."],
] as const;

export default function TrustPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LegalPageHeader maxWidthClass="max-w-6xl" />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-12 max-w-3xl">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Trust Center
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Compliance evidence for EU-facing AI workflows.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Corelyx is built around EU-first automation controls: data-flow
            visibility, human approval gates, run-level audit trails, DPA and
            subprocessor transparency, EU-only mode for eligible workflows, and
            AI Act-ready controls. Final compliance depends on use case,
            configuration, customer role, and the providers a workspace enables.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg border border-border bg-card/60 p-5 transition-colors hover:bg-accent"
            >
              <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </Link>
          ))}
        </section>

        <section className="mt-12 rounded-lg border border-border bg-card/60 p-6">
          <h2 className="text-lg font-bold text-foreground">Technical and organisational measures</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              "TLS in transit and provider-managed encryption at rest.",
              "Server-side credential access through established token and Vault helpers.",
              "Workspace and program access checks with role-based permissions.",
              "Human approval gates for sensitive AI and external-system actions.",
              "Execution metadata, payload minimisation, retention jobs, and secret redaction.",
              "Internal web-to-runtime calls use shared internal authentication helpers.",
            ].map((item) => (
              <p key={item} className="rounded-lg border border-border/70 bg-background/50 p-4 text-sm text-muted-foreground">
                {item}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-border bg-card/60 p-6">
          <h2 className="text-lg font-bold text-foreground">Assurance status</h2>
          <div className="mt-4 divide-y divide-border/70">
            {assurance.map(([title, body]) => (
              <div key={title} className="grid gap-2 py-4 md:grid-cols-[220px_1fr]">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-border bg-card/60 p-6">
          <h2 className="text-lg font-bold text-foreground">Vulnerability disclosure</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Please report security issues privately to{" "}
            <a href="mailto:security@corelyx.app" className="text-primary hover:underline">
              security@corelyx.app
            </a>
            . The detailed policy, scope, severity targets, and coordinated
            disclosure expectations are published on the{" "}
            <Link href="/security" className="text-primary hover:underline">Security</Link>{" "}
            page.
          </p>
        </section>
      </main>
    </div>
  );
}
