import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";
import { AI_ACT_NOTICE_TEXT, HIGH_IMPACT_USE_CASES } from "@/lib/compliance/workflow";

export const metadata: Metadata = {
  title: "EU AI Act Readiness",
  description:
    "Corelyx AI Act-ready workflow controls for risk classification, transparency notices, human approval gates, audit logs, model tracking, and documentation exports.",
  alternates: { canonical: "https://www.corelyx.app/ai-act" },
  openGraph: { url: "https://www.corelyx.app/ai-act" },
};

const controls = [
  "Risk classification support for workflow use cases.",
  "Human approval gates for high-impact and model-mediated actions.",
  "Transparency notice text that can be reused in UI or API surfaces.",
  "Run-level audit logs with model, provider, policy, and approval metadata.",
  "Model/provider tracking and data-flow preview before publishing.",
  "Workflow compliance exports for AI governance reviews and DPIA inputs.",
] as const;

export default function AiActPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LegalPageHeader maxWidthClass="max-w-5xl" />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10 max-w-3xl">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            EU AI Act
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            AI Act-ready workflow controls.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Corelyx provides AI Act-ready workflow controls: risk classification
            support, transparency notices, human approval gates, audit logs,
            model/provider tracking, and documentation exports. Final
            obligations depend on your use case and your role under the EU AI
            Act.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          {controls.map((control) => (
            <div key={control} className="rounded-lg border border-border bg-card/60 p-5 text-sm text-muted-foreground">
              {control}
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-lg border border-border bg-card/60 p-6">
          <h2 className="text-lg font-bold">Risk workflow in Corelyx</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Workflows can store an AI use-case category, AI Act risk level,
              customer role, oversight requirements, transparency notice
              requirements, reviewer, review timestamp, prohibited-use notes,
              and risk-review notes.
            </p>
            <p>
              If a workflow is marked as prohibited, publishing is blocked
              unless an admin legal-review override is enabled for review or
              testing. If a workflow is marked as high risk, Corelyx requires
              human oversight gates, documentation export, explicit reviewer
              approval before publish, and audit logging.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-border bg-card/60 p-6">
          <h2 className="text-lg font-bold">Use cases that require extra review</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {HIGH_IMPACT_USE_CASES.map((item) => (
              <p key={item} className="rounded-lg border border-border/70 bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                {item}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-border bg-card/60 p-6">
          <h2 className="text-lg font-bold">Reusable transparency notice</h2>
          <p className="mt-3 rounded-lg border border-border/70 bg-background/50 p-4 text-sm leading-relaxed text-muted-foreground">
            {AI_ACT_NOTICE_TEXT}
          </p>
        </section>

        <section className="mt-8 rounded-lg border border-border bg-card/60 p-6">
          <h2 className="text-lg font-bold">Important limitation</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Corelyx does not claim that workflows are automatically compliant by
            default. The customer remains responsible for legal classification,
            lawful purpose, role assessment, notices, DPIAs or fundamental
            rights assessments where required, and the downstream impact of
            automated decisions.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            See also the{" "}
            <Link href="/trust" className="text-primary hover:underline">Trust Center</Link>{" "}
            and{" "}
            <Link href="/data-residency" className="text-primary hover:underline">Data Residency</Link>{" "}
            pages.
          </p>
        </section>
      </main>
    </div>
  );
}
