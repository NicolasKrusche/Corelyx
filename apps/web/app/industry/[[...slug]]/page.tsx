import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSeoMetadata, SeoContentPage } from "@/components/seo/seo-content-page";
import { getSeoPage, getSeoPagesBySection, pathFromParts } from "@/lib/seo/content";

type PageProps = { params: Promise<{ slug?: string[] }> };

export function generateStaticParams() {
  return getSeoPagesBySection("industry").map((page) => ({
    slug: page.path === "/industry" ? [] : page.path.replace("/industry/", "").split("/"),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug = [] } = await params;
  const page = getSeoPage(pathFromParts("industry", slug));
  if (!page) notFound();
  return createSeoMetadata(page);
}

export default async function IndustryPage({ params }: PageProps) {
  const { slug = [] } = await params;
  const page = getSeoPage(pathFromParts("industry", slug));
  if (!page) notFound();
  return <SeoContentPage page={page} />;
}
