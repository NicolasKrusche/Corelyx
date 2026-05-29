import type { MetadataRoute } from "next";

const BASE = "https://www.corelyx.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/pricing",
          "/privacy",
          "/terms",
          "/impressum",
          "/subprocessors",
          "/dpa",
          "/security",
          "/trust",
          "/data-residency",
          "/gdpr",
          "/ai-act",
          "/compliance",
          "/docs",
          "/templates",
          "/compare",
          "/academy",
          "/blog",
          "/integrations",
          "/use-cases",
          "/industry",
          "/ai-governance-platform",
          "/gdpr-compliant-ai-automation",
          "/eu-ai-act-ready-ai-platform",
          "/ai-risk-management",
          "/ai-inventory",
          "/ai-audit-trails",
          "/human-oversight-for-ai",
          "/dpia-generator",
          "/ai-documentation-generator",
          "/tools",
          "/dpia-template",
          "/data-export-schema",
        ],
        disallow: [
          // Auth flows: thin, no index value.
          "/login",
          "/signup",
          "/forgot-password",
          "/update-password",
          "/auth/",
          // Redirect alias: canonical is /pricing.
          "/prices",
          // Authenticated app shell: all require login.
          "/dashboard",
          "/programs",
          "/runs",
          "/connections",
          "/settings",
          "/profile",
          "/credits",
          "/approvals",
          "/env-vars",
          "/logs",
          "/api-keys",
          "/support",
          "/account",
          "/workspaces",
          "/browse",
          "/plan",
          // Internal and API.
          "/api/",
          "/admin/",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
