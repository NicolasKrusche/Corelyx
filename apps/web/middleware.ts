import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { Database } from "@flowos/db";
import { applySecurityHeaders } from "@/lib/security-headers";
import { maintenanceMiddleware } from "@/lib/maintenance-middleware";
import { looksLikeToken } from "@/lib/personal-tokens";

// ─── Bearer token auth (personal API tokens) ──────────────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validates a crlx_ bearer token against the personal_api_tokens table.
 * Returns the user_id and token row id on success, or null if invalid.
 */
async function resolvePersonalToken(
  token: string
): Promise<{ userId: string; tokenId: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  const hash = await sha256Hex(token);

  // Direct REST call — avoids importing the JS client (works reliably in Edge).
  const url = `${supabaseUrl}/rest/v1/personal_api_tokens?token_hash=eq.${encodeURIComponent(hash)}&select=id,user_id&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string; user_id: string }>;
  if (!rows[0]) return null;

  // Fire-and-forget last_used_at update (non-blocking)
  fetch(
    `${supabaseUrl}/rest/v1/personal_api_tokens?id=eq.${rows[0].id}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }
  ).catch(() => {/* best-effort */});

  return { userId: rows[0].user_id, tokenId: rows[0].id };
}

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
  "/api/u/",
  "/u/",
  "/api/health",
  "/privacy",
  "/terms",
  "/dpa",
  "/dpia-template",
  "/data-export-schema",
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

  // Personal API token bearer auth — only applies to /api/ routes.
  // If a valid crlx_ token is presented we inject x-token-user-id so that
  // getAuthUser() in the route handler can resolve the user without cookies.
  if (pathname.startsWith("/api/")) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (looksLikeToken(token)) {
        const resolved = await resolvePersonalToken(token);
        if (resolved) {
          requestHeaders.set("x-token-user-id", resolved.userId);
          const response = NextResponse.next({ request: { headers: requestHeaders } });
          applySecurityHeaders(response.headers, nonce);
          return response;
        }
        // Invalid token — reject immediately rather than falling through to cookie check
        return NextResponse.json({ error: "Invalid or expired API token." }, { status: 401 });
      }
    }
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

  // getSession reads from cookie — no network call, safe for Edge middleware latency constraints.
  // Route handlers that need server-verified identity must call supabase.auth.getUser() themselves.
  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    session = null;
  }

  if (!session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithSecurity(url);
  }

  if (session && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return redirectWithSecurity(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
