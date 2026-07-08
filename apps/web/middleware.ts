import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { Database } from "@flowos/db";
import { applySecurityHeaders } from "@/lib/security-headers";
import { maintenanceGate } from "@/lib/maintenance-middleware";
import { looksLikeToken } from "@/lib/personal-tokens";
import { isSessionExemptApiRoute } from "@/lib/session-exempt-api-routes";

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
  "/api/status",
  "/download",
  "/api/desktop/",
  "/maintenance",
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
  "/ai-governance-platform",
  "/ai-workflow-governance",
  "/secure-ai-workflows",
  "/ai-workflow-automation-governance",
  "/legal-ai-workflow-automation",
  "/gdpr-compliant-ai-automation",
  "/eu-ai-act-ready-ai-platform",
  "/ai-risk-management",
  "/ai-inventory",
  "/ai-audit-trails",
  "/human-oversight-for-ai",
  "/dpia-generator",
  "/ai-documentation-generator",
  "/tools",
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

  // Strip any client-supplied copies of headers the app trusts as
  // middleware-injected. Without this a caller could forge x-token-user-id to
  // impersonate any user (and thereby take the personal-token path that skips
  // the email-2FA gate), or forge x-pathname to dodge the 2FA exemption check.
  // x-token-user-id is (re)set only on a verified token below; x-pathname is set
  // here from the real path, overwriting anything the client sent.
  requestHeaders.delete("x-token-user-id");
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

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

  // Maintenance mode / feature kill-switches (DB-backed — toggled at runtime
  // with no redeploy). Runs before bearer-token auth so external API callers are
  // gated too; internal runtime callbacks above are intentionally exempt.
  const maintenanceResponse = await maintenanceGate(request);
  if (maintenanceResponse) {
    applySecurityHeaders(maintenanceResponse.headers, nonce);
    return maintenanceResponse;
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

  if (isSessionExemptApiRoute(pathname)) {
    return nextWithSecurity();
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

  // Public routes don't depend on the session: the only session-gated behavior on
  // a public path is bouncing an already-logged-in visitor off the auth pages.
  // For every other public route (homepage, marketing/SEO/docs pages, robots,
  // sitemap) skip the Supabase client + getSession() JWT decode — that decode is
  // the bulk of middleware CPU and this is the bulk of unauthenticated traffic.
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  if (isPublic && !isAuthPage) {
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
    // API consumers get a proper 401 instead of a 307 redirect to the login page.
    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      applySecurityHeaders(response.headers, nonce);
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithSecurity(url);
  }

  if (session && (pathname === "/login" || pathname === "/signup")) {
    // The cookie JWT can outlive its session ("Sign out everywhere", password
    // change, remote revoke). Bouncing a dead session to /dashboard loops
    // forever against the app layout's server-verified redirect back to
    // /login — so verify against the auth server before bouncing. This network
    // call only runs on auth pages visited with a session cookie present.
    let verifiedUser = false;
    try {
      const { data } = await supabase.auth.getUser();
      verifiedUser = Boolean(data.user);
    } catch {
      verifiedUser = false;
    }
    if (verifiedUser) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return redirectWithSecurity(url);
    }
    // Dead or unverifiable session: let the visitor reach the login page.
  }

  return supabaseResponse;
}

export const config = {
  // Skip middleware on framework assets and static bot/asset paths that need
  // neither auth nor a CSP nonce (robots/sitemap, favicons, fonts, manifest,
  // images). Narrowing the matcher keeps middleware CPU off high-frequency,
  // non-app traffic. Deliberately not excluding .js/.css/.json/.txt/.xml so no
  // dynamic route handler is accidentally dropped.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|webmanifest)$).*)",
  ],
};
