import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";

export const metadata: Metadata = {
  title: "DPIA Template",
  description:
    "Customer-facing Data Protection Impact Assessment (DPIA) template for Corelyx workflows that process personal data under GDPR Article 35.",
  alternates: { canonical: "https://www.corelyx.app/dpia-template" },
  openGraph: { url: "https://www.corelyx.app/dpia-template" },
};

const triggers = [
  "Special-category data such as health, biometric, political, religious, trade-union, sexual-orientation, genetic, or racial/ethnic-origin data",
  "AI Act Annex III domains such as employment, education, credit, insurance, healthcare, critical infrastructure, law enforcement, migration, justice, or public services",
  "Large-scale personal-data processing, profiling, or systematic monitoring",
  "Automated decisions with legal or similarly significant effects",
  "Combining datasets, vulnerable individuals, novel technology, or public-area monitoring",
];

const templateSections = [
  ["Workflow identification", "Workflow name, Corelyx program ID, controller owner, privacy lead or DPO, assessment date, workflow status, and next review date."],
  ["Description of processing", "Purpose, node-by-node data flow, data subjects, personal-data categories, volume, frequency, and raw-input retention."],
  ["Necessity and proportionality", "Lawful basis under GDPR Article 6, Article 9 condition if special-category data is involved, legitimate-interest balancing where relevant, and data minimization by field."],
  ["Risks to data subjects", "Confidentiality, integrity, availability, fairness/discrimination, cross-border transfer, and residual-risk assessment."],
  ["AI Act-specific review", "Applicable Annex III domain, role of AI in the decision, human oversight, approval-gate configuration, reviewer authority, fallback handling, and deployer registration if required."],
  ["Data subject rights", "How information, access, rectification, erasure, restriction, portability, objection, and human review rights are operationalized for the workflow."],
  ["Mitigations and sign-off", "Document Corelyx safeguards, customer safeguards, residual risk owner, approval decision, review cadence, and suspension criteria."],
];

export default async function DpiaTemplatePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LegalPageHeader maxWidthClass="max-w-4xl" />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-10">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Compliance
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            DPIA Template
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Customer-facing starting point for workflows that process personal data. The customer remains the controller and owns the completed DPIA.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">When to complete a DPIA</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Complete a DPIA before activating a Corelyx workflow if any of these apply:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {triggers.map((trigger) => (
              <li key={trigger}>{trigger}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Template sections</h2>
          <div className="mt-4 divide-y divide-border/70">
            {templateSections.map(([title, description], index) => (
              <div key={title} className="grid gap-2 py-3 sm:grid-cols-[220px_1fr]">
                <p className="text-sm font-medium text-foreground">{index + 1}. {title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Corelyx safeguards to consider</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>PII and secret redaction before LLM prompt submission</li>
            <li>Human approval gates for AI or high-impact workflow steps</li>
            <li>Execution logging with metadata-only defaults and retention limits</li>
            <li>Processing restriction flag for GDPR Article 18 requests</li>
            <li>Data export, deletion, and audit trails for accountability</li>
          </ul>
        </section>
      </main>
      <footer className="border-t border-border/40 px-6 py-6">
        <div className="mx-auto flex max-w-4xl items-center gap-5 text-xs text-muted-foreground/60">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/dpa" className="hover:text-foreground">DPA</Link>
          <Link href="/subprocessors" className="hover:text-foreground">Subprocessors</Link>
        </div>
      </footer>
    </div>
  );
}
