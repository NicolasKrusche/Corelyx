export function GET() {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://corelyx.app";
  const body = `User-agent: *
Allow: /
Allow: /pricing
Allow: /privacy
Allow: /terms
Allow: /impressum
Allow: /subprocessors
Allow: /dpa
Allow: /security
Allow: /dpia-template
Allow: /data-export-schema
Disallow: /dashboard
Disallow: /programs
Disallow: /runs
Disallow: /api/
Disallow: /admin/

Sitemap: ${APP_URL}/sitemap.xml
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
