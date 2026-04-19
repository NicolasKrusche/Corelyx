export function GET() {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexflow.app";
  const body = `User-agent: *
Allow: /
Allow: /pricing
Allow: /privacy
Allow: /terms
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
