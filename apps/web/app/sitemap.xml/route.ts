export function GET() {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexflow.app";
  const now = new Date().toISOString().split("T")[0];

  const pages = [
    { url: APP_URL,              priority: "1.0", changefreq: "weekly"  },
    { url: `${APP_URL}/pricing`, priority: "0.9", changefreq: "monthly" },
    { url: `${APP_URL}/privacy`, priority: "0.5", changefreq: "yearly"  },
    { url: `${APP_URL}/terms`,   priority: "0.5", changefreq: "yearly"  },
    { url: `${APP_URL}/impressum`, priority: "0.5", changefreq: "yearly"  },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${p.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
