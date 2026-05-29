import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_COMPLIANCE_TOOLS } from "@/lib/compliance/tool-definitions";
import { SITE_URL } from "@/lib/seo/content";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Free AI Compliance Tools | Corelyx",
  description:
    "Free AI governance tools for AI Act risk classification, AI inventory, DPIA drafts, governance maturity, and compliance documentation.",
  alternates: { canonical: `${SITE_URL}/tools` },
  robots: { index: true, follow: true },
};

export default async function PublicToolsIndexPage() {
  let isSignedIn = false;
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    isSignedIn = !!data.user;
  } catch {
    // Best-effort — fall back to guest state
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-bold">Corelyx</Link>
          {isSignedIn ? (
            <Link href="/dashboard" className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              Sign in
            </Link>
          )}
        </header>
        <section className="py-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Public compliance tools</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">
            Free tools for AI governance, GDPR, EU AI Act readiness, and AI risk management.
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground">
            Generate practical reports for AI system inventory, risk classification, DPIA drafts, maturity assessment, and compliance documentation. Corelyx turns these same controls into governed workflow evidence inside the platform.
          </p>
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PUBLIC_COMPLIANCE_TOOLS.map((tool) => (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              className="rounded-lg border border-border bg-card p-5 transition-colors hover:bg-secondary"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{tool.primaryQuery}</p>
              <h2 className="mt-3 text-xl font-bold">{tool.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{tool.description}</p>
              <p className="mt-4 text-sm font-semibold text-primary">Open tool</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}

