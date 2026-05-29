import type { MetadataRoute } from "next";
import { allSeoPages, SITE_URL } from "@/lib/seo/content";
import { PUBLIC_COMPLIANCE_TOOLS } from "@/lib/compliance/tool-definitions";

const BASE = SITE_URL;

// Hardcoded lastmod dates. Using Date.now() causes crawlers to see every page
// as updated on every crawl, which wastes crawl budget.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE,
      lastModified: new Date("2026-05-28"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE}/pricing`,
      lastModified: new Date("2026-05-01"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE}/trust`,
      lastModified: new Date("2026-05-27"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE}/dpa`,
      lastModified: new Date("2026-04-24"),
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${BASE}/subprocessors`,
      lastModified: new Date("2026-05-27"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE}/data-residency`,
      lastModified: new Date("2026-05-27"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE}/privacy`,
      lastModified: new Date("2026-04-24"),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${BASE}/terms`,
      lastModified: new Date("2026-04-24"),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${BASE}/impressum`,
      lastModified: new Date("2026-05-27"),
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${BASE}/dpia-template`,
      lastModified: new Date("2026-04-24"),
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${BASE}/data-export-schema`,
      lastModified: new Date("2026-04-24"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE}/tools`,
      lastModified: new Date("2026-05-29"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...PUBLIC_COMPLIANCE_TOOLS.map((tool) => ({
      url: `${BASE}/tools/${tool.slug}`,
      lastModified: new Date("2026-05-29"),
      changeFrequency: "monthly" as const,
      priority: 0.75,
    })),
    ...allSeoPages.map((page) => ({
      url: `${BASE}${page.path}`,
      lastModified: new Date(page.lastModified),
      changeFrequency: "monthly" as const,
      priority: page.path.split("/").filter(Boolean).length === 1 ? 0.85 : 0.65,
    })),
  ];
}
