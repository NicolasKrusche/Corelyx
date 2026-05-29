import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicComplianceTool } from "@/components/compliance/public-compliance-tool";
import {
  getPublicComplianceTool,
  PUBLIC_COMPLIANCE_TOOLS,
  type PublicComplianceToolSlug,
} from "@/lib/compliance/tool-definitions";
import { SITE_URL } from "@/lib/seo/content";
import { createServerClient } from "@/lib/supabase/server";

export function generateStaticParams() {
  return PUBLIC_COMPLIANCE_TOOLS.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getPublicComplianceTool(slug);
  if (!tool) return { title: "Compliance Tool | Corelyx" };
  const url = `${SITE_URL}/tools/${tool.slug}`;
  return {
    title: `${tool.title} | Corelyx`,
    description: tool.description,
    keywords: [
      tool.primaryQuery,
      "AI governance",
      "GDPR",
      "EU AI Act",
      "AI risk management",
      "AI inventory",
      "AI compliance automation",
    ],
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${tool.title} | Corelyx`,
      description: tool.description,
      url,
      siteName: "Corelyx",
    },
  };
}

export default async function PublicComplianceToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getPublicComplianceTool(slug);
  if (!tool) notFound();

  let isSignedIn = false;
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    isSignedIn = !!data.user;
  } catch {
    // Best-effort — fall back to guest state
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: tool.title,
    url: `${SITE_URL}/tools/${tool.slug}`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: tool.description,
    provider: {
      "@type": "Organization",
      name: "Corelyx",
      url: SITE_URL,
    },
    audience: {
      "@type": "Audience",
      audienceType: tool.audience,
    },
  };

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-bold">Corelyx</Link>
          <nav className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/tools" className="hover:text-foreground">Tools</Link>
            <Link href="/ai-governance-platform" className="hidden hover:text-foreground sm:inline">AI Governance</Link>
            {isSignedIn ? (
              <Link href="/dashboard" className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground">
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground">
                Sign in
              </Link>
            )}
          </nav>
        </header>

        <section className="py-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            {tool.primaryQuery}
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">
            {tool.title}
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground">
            {tool.description} The generated output is a working draft for governance review and should be validated by the accountable business, technical, legal, and compliance owners.
          </p>
        </section>

        <PublicComplianceTool slug={tool.slug as PublicComplianceToolSlug} />

        <section className="mt-10 grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-3">
          <div>
            <h2 className="text-sm font-semibold">Problem</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              AI workflows are often created faster than organizations can inventory, classify, document, monitor, audit, review, and govern them.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Regulatory relevance</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              GDPR and the EU AI Act both reward clear records, risk assessment, human oversight, logging, and accountable review processes.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Corelyx solution</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Inside Corelyx, these draft reports become workflow-native evidence connected to schemas, approvals, execution logs, and exports.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

