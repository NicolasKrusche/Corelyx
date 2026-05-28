import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSeoMetadata, SeoContentPage } from "@/components/seo/seo-content-page";
import { getSeoPage } from "@/lib/seo/content";

const page = getSeoPage("/gdpr");

export const metadata: Metadata = page
  ? createSeoMetadata(page)
  : { title: "GDPR-Compliant AI Workflow Automation | Corelyx" };

export default function GdprPage() {
  if (!page) notFound();
  return <SeoContentPage page={page} />;
}
