import type { MetadataRoute } from "next";

const BASE = "https://corelyx.app";

// Hardcoded lastmod dates — update when page content significantly changes.
// Using dynamic Date.now() causes Googlebot to see every page as "updated today"
// on every crawl, which wastes crawl budget.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE,
      lastModified: new Date("2026-05-01"),
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
      url: `${BASE}/security`,
      lastModified: new Date("2026-05-01"),
      changeFrequency: "yearly",
      priority: 0.7,
    },
    {
      url: `${BASE}/dpa`,
      lastModified: new Date("2026-04-24"),
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${BASE}/subprocessors`,
      lastModified: new Date("2026-05-01"),
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
      lastModified: new Date("2026-04-24"),
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
  ];
}
