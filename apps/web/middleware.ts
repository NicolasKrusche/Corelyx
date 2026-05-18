import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { Database } from "@flowos/db";
import { applySecurityHeaders } from "@/lib/security-headers";
import { maintenanceMiddleware } from "@/lib/maintenance-middleware";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth/callback",
  "/api/auth/post-login",
  "/api/auth/signup",
  "/api/auth/reset-password",
  "/api/connections/oauth/github/callback",
  "/api/connections/oauth/airtable/callback",
  "/api/browse",
  "/api/health",
  "/privacy",
  "/terms",
  "/dpa",
  "/dpia-template",
  "/data-export-schema",
  "/security",
  "/subprocessors",
  "/impressum",
  "/pricing",
  "/prices",
  "/robots.txt",
  "/sitemap.xml",
];

// Internal API routes authenticated by a scoped internal service token never redirect to login
const INTERNAL_API_PREFIX = "/api/internal/";

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  function nextWithSecurity() {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response.headers, nonce);
    return response;
  }

  function redirectWithSecurity(url: URL) {
    const response = NextResponse.redirect(url);
    applySecurityHeaders(response.headers, nonce);
    return response;
  }

  // If Supabase isn't configured yet, allow all public routes through
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;

  // Internal API routes authenticate via internal service tokens so session checks are skipped
  if (pathname.startsWith(INTERNAL_API_PREFIX)) {
    return nextWithSecurity();
  }

  // Check maintenance mode and feature flags
  const maintenanceResponse = maintenanceMiddleware(request);
  if (maintenanceResponse) {
    applySecurityHeaders(maintenanceResponse.headers, nonce);
    return maintenanceResponse;
  }

  const isPublic = pathname === "/" || PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  if (!supabaseUrl || supabaseUrl.includes("placeholder") || !supabaseKey || supabaseKey.includes("placeholder")) {
    if (!isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return redirectWithSecurity(url);
    }
    return nextWithSecurity();
  }

  let supabaseResponse = nextWithSecurity();

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = nextWithSecurity();
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithSecurity(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return redirectWithSecurity(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
