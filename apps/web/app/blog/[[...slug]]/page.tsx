import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSeoMetadata, SeoContentPage } from "@/components/seo/seo-content-page";
import { getSeoPage, getSeoPagesBySection, pathFromParts } from "@/lib/seo/content";

type PageProps = { params: Promise<{ slug?: string[] }> };

export function generateStaticParams() {
  return getSeoPagesBySection("blog").map((page) => ({
    slug: page.path === "/blog" ? [] : page.path.replace("/blog/", "").split("/"),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug = [] } = await params;
  const page = getSeoPage(pathFromParts("blog", slug));
  if (!page) notFound();
  return createSeoMetadata(page);
}

export default async function BlogPage({ params }: PageProps) {
  const { slug = [] } = await params;
  const page = getSeoPage(pathFromParts("blog", slug));
  if (!page) notFound();
  return <SeoContentPage page={page} />;
}
