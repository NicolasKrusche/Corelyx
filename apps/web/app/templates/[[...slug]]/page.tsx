import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSeoMetadata, SeoContentPage } from "@/components/seo/seo-content-page";
import { getSeoPage, getSeoPagesBySection, pathFromParts } from "@/lib/seo/content";

type PageProps = { params: Promise<{ slug?: string[] }> };

export function generateStaticParams() {
  return getSeoPagesBySection("templates").map((page) => ({
    slug: page.path === "/templates" ? [] : page.path.replace("/templates/", "").split("/"),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug = [] } = await params;
  const page = getSeoPage(pathFromParts("templates", slug));
  if (!page) notFound();
  return createSeoMetadata(page);
}

export default async function TemplatesPage({ params }: PageProps) {
  const { slug = [] } = await params;
  const page = getSeoPage(pathFromParts("templates", slug));
  if (!page) notFound();
  return <SeoContentPage page={page} />;
}
