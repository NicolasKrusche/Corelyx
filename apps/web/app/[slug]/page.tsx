import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSeoMetadata, SeoContentPage } from "@/components/seo/seo-content-page";
import { allSeoPages, getSeoPage } from "@/lib/seo/content";

const EXPLICIT_TOP_LEVEL_ROUTES = new Set([
  "/ai-act",
  "/blog",
  "/compare",
  "/compliance",
  "/docs",
  "/gdpr",
  "/industry",
  "/integrations",
  "/security",
  "/templates",
  "/use-cases",
]);

export function generateStaticParams() {
  return allSeoPages
    .filter((page) => page.path.split("/").filter(Boolean).length === 1)
    .filter((page) => !EXPLICIT_TOP_LEVEL_ROUTES.has(page.path))
    .map((page) => ({ slug: page.path.slice(1) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoPage(`/${slug}`);
  return page ? createSeoMetadata(page) : { title: "Corelyx" };
}

export default async function DynamicTopLevelSeoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getSeoPage(`/${slug}`);
  if (!page) notFound();
  return <SeoContentPage page={page} />;
}
