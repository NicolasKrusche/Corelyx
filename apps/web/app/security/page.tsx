import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSeoMetadata, SeoContentPage } from "@/components/seo/seo-content-page";
import { getSeoPage } from "@/lib/seo/content";

const page = getSeoPage("/security");

export const metadata: Metadata = page
  ? createSeoMetadata(page)
  : { title: "Secure AI Workflow Orchestration | Corelyx" };

export default function SecurityPage() {
  if (!page) notFound();
  return <SeoContentPage page={page} />;
}
