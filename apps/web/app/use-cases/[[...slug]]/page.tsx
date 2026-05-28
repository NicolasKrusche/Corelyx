import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSeoMetadata, SeoContentPage } from "@/components/seo/seo-content-page";
import { getSeoPage, getSeoPagesBySection, pathFromParts } from "@/lib/seo/content";

type PageProps = { params: Promise<{ slug?: string[] }> };

export function generateStaticParams() {
  return getSeoPagesBySection("use-cases").map((page) => ({
    slug: page.path === "/use-cases" ? [] : page.path.replace("/use-cases/", "").split("/"),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug = [] } = await params;
  const page = getSeoPage(pathFromParts("use-cases", slug));
  if (!page) notFound();
  return createSeoMetadata(page);
}

export default async function UseCasesPage({ params }: PageProps) {
  const { slug = [] } = await params;
  const page = getSeoPage(pathFromParts("use-cases", slug));
  if (!page) notFound();
  return <SeoContentPage page={page} />;
}
