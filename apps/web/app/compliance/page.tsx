import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSeoMetadata, SeoContentPage } from "@/components/seo/seo-content-page";
import { getSeoPage } from "@/lib/seo/content";

const page = getSeoPage("/compliance");

export const metadata: Metadata = page
  ? createSeoMetadata(page)
  : { title: "Compliance-First AI Workflow Automation | Corelyx" };

export default function CompliancePage() {
  if (!page) notFound();
  return <SeoContentPage page={page} />;
}
